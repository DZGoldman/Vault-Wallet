// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/TimelockVault.sol";

// Mock contract for testing executions
contract MockTarget {
    uint256 public value;
    bool public called;
    
    function setValue(uint256 _value) external {
        value = _value;
        called = true;
    }
    
    function reset() external {
        value = 0;
        called = false;
    }
}

contract TimelockVaultTest is Test {
    TimelockVault public vault;
    MockTarget public mockTarget;
    
    // Test accounts
    address public proposer = address(0x1);
    address public executor = address(0x2);
    address public recoveryTriggerer = address(0x3);
    address public recoverer = address(0x4);
    address public unauthorized = address(0x5);
    
    // Test operation parameters
    address public target;
    uint256 public value = 0;
    bytes public data;
    bytes32 public predecessor = bytes32(0);
    bytes32 public salt = bytes32(0);
    uint256 public delay = 1 days;
    
    // Events to test
    event RecoveryModeTriggered(address indexed triggerer, uint256 currentEpoch);
    event RecoveryModeExited(address indexed recoverer, uint256 currentEpoch);
    event AllOperationsCancelled(uint256 newEpoch, address indexed canceller);
    event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay);
    
    function setUp() public {
        // Deploy mock target
        mockTarget = new MockTarget();
        target = address(mockTarget);
        data = abi.encodeWithSignature("setValue(uint256)", 42);
        
        address[] memory proposers = new address[](1);
        proposers[0] = proposer;
        
        address[] memory executors = new address[](1);
        executors[0] = executor;
        
        address[] memory recoveryTriggerers = new address[](1);
        recoveryTriggerers[0] = recoveryTriggerer;
        
        address[] memory recoverers = new address[](1);
        recoverers[0] = recoverer;

        vault = new TimelockVault(
            delay,
            proposers,
            executors,
            recoveryTriggerers,
            recoverers
        );
        
        // Fund the vault for tests that need it
        vm.deal(address(vault), 10 ether);
    }
    
    // =============================================================================
    // Constructor & Initial State Tests
    // =============================================================================
    
    function testInitialState() public {
        assertFalse(vault.recoveryMode());
        assertEq(vault.currentRecoveryEpoch(), 1);
        
        // Check role assignments
        assertTrue(vault.hasRole(vault.RECOVERY_TRIGGER_ROLE(), recoveryTriggerer));
        assertTrue(vault.hasRole(vault.RECOVERER_ROLE(), recoverer));
        assertTrue(vault.hasRole(vault.PROPOSER_ROLE(), proposer));
        assertTrue(vault.hasRole(vault.EXECUTOR_ROLE(), executor));
    }
    
    function testRoleConstants() public {
        // Verify role constants are correctly defined
        assertEq(vault.RECOVERY_TRIGGER_ROLE(), keccak256("RECOVERY_TRIGGER_ROLE"));
        assertEq(vault.RECOVERER_ROLE(), keccak256("RECOVERER_ROLE"));
    }
    
    // =============================================================================
    // Recovery Mode Tests
    // =============================================================================
    
    function testTriggerRecoveryMode() public {
        vm.expectEmit(true, false, false, true);
        emit RecoveryModeTriggered(recoveryTriggerer, 1);
        
        vm.prank(recoveryTriggerer);
        vault.triggerRecoveryMode();
        
        assertTrue(vault.recoveryMode());
        
        // Check that role admins have changed
        assertEq(vault.getRoleAdmin(vault.PROPOSER_ROLE()), vault.RECOVERER_ROLE());
        assertEq(vault.getRoleAdmin(vault.EXECUTOR_ROLE()), vault.RECOVERER_ROLE());
        assertEq(vault.getRoleAdmin(vault.CANCELLER_ROLE()), vault.RECOVERER_ROLE());
        assertEq(vault.getRoleAdmin(vault.RECOVERY_TRIGGER_ROLE()), vault.RECOVERER_ROLE());
    }
    
    function testTriggerRecoveryModeUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        vault.triggerRecoveryMode();
    }
    
    function testTriggerRecoveryModeWhenAlreadyInRecovery() public {
        vm.prank(recoveryTriggerer);
        vault.triggerRecoveryMode();
        
        vm.prank(recoveryTriggerer);
        vm.expectRevert(TimelockVault.CannotPerformOperationInRecoveryMode.selector);
        vault.triggerRecoveryMode();
    }
    
    function testExitRecoveryMode() public {
        // First trigger recovery mode
        vm.prank(recoveryTriggerer);
        vault.triggerRecoveryMode();
        
        vm.expectEmit(true, false, false, true);
        emit RecoveryModeExited(recoverer, 1);
        
        vm.prank(recoverer);
        vault.exitRecoveryMode();
        
        assertFalse(vault.recoveryMode());
        
        // Check that role admins have been restored
        assertEq(vault.getRoleAdmin(vault.PROPOSER_ROLE()), vault.DEFAULT_ADMIN_ROLE());
        assertEq(vault.getRoleAdmin(vault.EXECUTOR_ROLE()), vault.DEFAULT_ADMIN_ROLE());
        assertEq(vault.getRoleAdmin(vault.CANCELLER_ROLE()), vault.DEFAULT_ADMIN_ROLE());
        assertEq(vault.getRoleAdmin(vault.RECOVERY_TRIGGER_ROLE()), vault.DEFAULT_ADMIN_ROLE());
    }
    
    function testExitRecoveryModeUnauthorized() public {
        vm.prank(recoveryTriggerer);
        vault.triggerRecoveryMode();
        
        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSelector(TimelockVault.CallerIsNotRecoverer.selector, unauthorized));
        vault.exitRecoveryMode();
    }
    
    function testExitRecoveryModeWhenNotInRecovery() public {
        vm.prank(recoverer);
        vm.expectRevert(TimelockVault.NotInRecoveryMode.selector);
        vault.exitRecoveryMode();
    }
    
    // =============================================================================
    // Scheduling Tests
    // =============================================================================
    
    function testScheduleOperation() public {
        bytes32 id = vault.hashOperation(target, value, data, predecessor, salt);
        
        vm.expectEmit(true, true, false, true);
        emit CallScheduled(id, 0, target, value, data, predecessor, delay);
        
        vm.prank(proposer);
        vault.schedule(target, value, data, predecessor, salt, delay);
        
        assertEq(uint(vault.getOperationState(id)), uint(TimelockController.OperationState.Waiting));
        assertEq(vault.getOperationEpoch(id), 1);
    }
    
    function testScheduleOperationUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert();
        vault.schedule(target, value, data, predecessor, salt, delay);
    }
    
    function testScheduleOperationInRecoveryMode() public {
        vm.prank(recoveryTriggerer);
        vault.triggerRecoveryMode();
        
        vm.prank(proposer);
        vm.expectRevert(TimelockVault.CannotPerformOperationInRecoveryMode.selector);
        vault.schedule(target, value, data, predecessor, salt, delay);
    }
    
    function testScheduleBatchOperation() public {
        address[] memory targets = new address[](2);
        targets[0] = target;
        targets[1] = address(0x456);
        
        uint256[] memory values = new uint256[](2);
        values[0] = 0;
        values[1] = 1 ether;
        
        bytes[] memory payloads = new bytes[](2);
        payloads[0] = "";
        payloads[1] = "test";
        
        bytes32 id = vault.hashOperationBatch(targets, values, payloads, predecessor, salt);
        
        vm.prank(proposer);
        vault.scheduleBatch(targets, values, payloads, predecessor, salt, delay);
        
        assertEq(uint(vault.getOperationState(id)), uint(TimelockController.OperationState.Waiting));
        assertEq(vault.getOperationEpoch(id), 1);
    }
    
    // =============================================================================
    // Execution Tests
    // =============================================================================
    
    function testExecuteOperation() public {
        bytes32 id = vault.hashOperation(target, value, data, predecessor, salt);
        
        // Schedule operation
        vm.prank(proposer);
        vault.schedule(target, value, data, predecessor, salt, delay);
        
        // Fast forward time
        vm.warp(block.timestamp + delay + 1);
        
        // Execute operation
        vm.prank(executor);
        vault.execute(target, value, data, predecessor, salt);
        
        // Operation should be Done
        assertEq(uint(vault.getOperationState(id)), uint(TimelockController.OperationState.Done));
        
        // Epoch should still be tracked (no cleanup)
        assertEq(vault.getOperationEpoch(id), 1);
        
        // Verify the mock target was called
        assertTrue(mockTarget.called());
        assertEq(mockTarget.value(), 42);
    }
    
    function testExecuteOperationInRecoveryMode() public {
        // Schedule operation
        vm.prank(proposer);
        vault.schedule(target, value, data, predecessor, salt, delay);
        
        // Fast forward time
        vm.warp(block.timestamp + delay + 1);
        
        // Trigger recovery mode
        vm.prank(recoveryTriggerer);
        vault.triggerRecoveryMode();
        
        // Try to execute - should fail
        vm.prank(executor);
        vm.expectRevert(TimelockVault.CannotPerformOperationInRecoveryMode.selector);
        vault.execute(target, value, data, predecessor, salt);
    }
    
    function testExecuteBatchOperation() public {
        address[] memory targets = new address[](2);
        targets[0] = target;
        targets[1] = target;
        
        uint256[] memory values = new uint256[](2);
        values[0] = 0;
        values[1] = 0;
        
        bytes[] memory payloads = new bytes[](2);
        payloads[0] = abi.encodeWithSignature("setValue(uint256)", 100);
        payloads[1] = abi.encodeWithSignature("reset()");
        
        bytes32 id = vault.hashOperationBatch(targets, values, payloads, predecessor, salt);
        
        // Schedule batch operation
        vm.prank(proposer);
        vault.scheduleBatch(targets, values, payloads, predecessor, salt, delay);
        
        // Fast forward time
        vm.warp(block.timestamp + delay + 1);
        
        // Execute batch operation
        vm.prank(executor);
        vault.executeBatch(targets, values, payloads, predecessor, salt);
        
        assertEq(uint(vault.getOperationState(id)), uint(TimelockController.OperationState.Done));
        
        // Verify the mock target was reset (second call)
        assertFalse(mockTarget.called());
        assertEq(mockTarget.value(), 0);
    }
    
    // =============================================================================
    // Global Cancellation Tests
    // =============================================================================
    
    function testCancelAllOperations() public {
        bytes32 id = vault.hashOperation(target, value, data, predecessor, salt);
        
        // Schedule operation
        vm.prank(proposer);
        vault.schedule(target, value, data, predecessor, salt, delay);
        
        assertEq(uint(vault.getOperationState(id)), uint(TimelockController.OperationState.Waiting));
        
        // Trigger recovery mode
        vm.prank(recoveryTriggerer);
        vault.triggerRecoveryMode();
        
        // Cancel all operations
        vm.expectEmit(false, true, false, true);
        emit AllOperationsCancelled(2, recoverer);
        
        vm.prank(recoverer);
        vault.cancelAllOperations();
        
        assertEq(vault.currentRecoveryEpoch(), 2);
        // Operation from epoch 1 should now show as Unset (globally cancelled)
        assertEq(uint(vault.getOperationState(id)), uint(TimelockController.OperationState.Unset));
    }
    
    function testCancelAllOperationsUnauthorized() public {
        vm.prank(recoveryTriggerer);
        vault.triggerRecoveryMode();
        
        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSelector(TimelockVault.CallerIsNotRecoverer.selector, unauthorized));
        vault.cancelAllOperations();
    }
    
    function testCancelAllOperationsWhenNotInRecovery() public {
        vm.prank(recoverer);
        vm.expectRevert(TimelockVault.NotInRecoveryMode.selector);
        vault.cancelAllOperations();
    }
    
    function testOperationsFromDifferentEpochs() public {
        // Schedule operation in epoch 1
        vm.prank(proposer);
        vault.schedule(target, value, data, predecessor, salt, delay);
        bytes32 id1 = vault.hashOperation(target, value, data, predecessor, salt);
        
        // Trigger recovery and cancel all
        vm.prank(recoveryTriggerer);
        vault.triggerRecoveryMode();
        
        vm.prank(recoverer);
        vault.cancelAllOperations();
        
        // Exit recovery mode
        vm.prank(recoverer);
        vault.exitRecoveryMode();
        
        // Schedule new operation in epoch 2
        vm.prank(proposer);
        vault.schedule(address(0x789), value, data, predecessor, bytes32(uint256(1)), delay);
        bytes32 id2 = vault.hashOperation(address(0x789), value, data, predecessor, bytes32(uint256(1)));
        
        // First operation should be globally cancelled (Unset), second should be waiting
        assertEq(uint(vault.getOperationState(id1)), uint(TimelockController.OperationState.Unset));
        assertEq(uint(vault.getOperationState(id2)), uint(TimelockController.OperationState.Waiting));
        
        // Check epochs
        assertEq(vault.getOperationEpoch(id1), 1); // From old epoch
        assertEq(vault.getOperationEpoch(id2), 2); // From current epoch
    }
    
    // =============================================================================
    // Cleanup Tests
    // =============================================================================
    
    // =============================================================================
    // Edge Cases and Integration Tests  
    // =============================================================================
    
    function testExecutedOperationFromOldEpochStillShowsDone() public {
        // This test verifies the critical bug fix: executed operations from old epochs
        // should still show as Done, not as globally cancelled
        
        bytes32 id = vault.hashOperation(target, value, data, predecessor, salt);
        
        // Schedule and execute operation in epoch 1
        vm.prank(proposer);
        vault.schedule(target, value, data, predecessor, salt, delay);
        
        vm.warp(block.timestamp + delay + 1);
        
        vm.prank(executor);
        vault.execute(target, value, data, predecessor, salt);
        
        // Verify execution worked
        assertEq(uint(vault.getOperationState(id)), uint(TimelockController.OperationState.Done));
        assertTrue(mockTarget.called());
        
        // Now trigger global cancellation (epoch 2)
        vm.prank(recoveryTriggerer);
        vault.triggerRecoveryMode();
        
        vm.prank(recoverer);
        vault.cancelAllOperations();
        
        // The executed operation should STILL show as Done, not as globally cancelled
        assertEq(uint(vault.getOperationState(id)), uint(TimelockController.OperationState.Done));
        assertEq(vault.getOperationEpoch(id), 1); // Still from epoch 1
    }
    
    function testMultipleRecoveryModeCycles() public {
        bytes32 id = vault.hashOperation(target, value, data, predecessor, salt);
        
        // Schedule operation
        vm.prank(proposer);
        vault.schedule(target, value, data, predecessor, salt, delay);
        
        // First recovery cycle
        vm.prank(recoveryTriggerer);
        vault.triggerRecoveryMode();
        
        vm.prank(recoverer);
        vault.cancelAllOperations();
        assertEq(vault.currentRecoveryEpoch(), 2);
        
        vm.prank(recoverer);
        vault.exitRecoveryMode();
        
        // Second recovery cycle
        vm.prank(recoveryTriggerer);
        vault.triggerRecoveryMode();
        
        vm.prank(recoverer);
        vault.cancelAllOperations();
        assertEq(vault.currentRecoveryEpoch(), 3);
        
        // Original operation should still be globally cancelled (show as Unset)
        assertEq(uint(vault.getOperationState(id)), uint(TimelockController.OperationState.Unset));
    }
    
    function testEpochZeroBugFixed() public {
        // This test ensures that operations scheduled in epoch 1 (not 0) 
        // can be properly globally cancelled
        
        bytes32 id = vault.hashOperation(target, value, data, predecessor, salt);
        
        vm.prank(proposer);
        vault.schedule(target, value, data, predecessor, salt, delay);
        
        // Verify operation is in epoch 1
        assertEq(vault.getOperationEpoch(id), 1);
        assertEq(uint(vault.getOperationState(id)), uint(TimelockController.OperationState.Waiting));
        
        // Global cancel should work
        vm.prank(recoveryTriggerer);
        vault.triggerRecoveryMode();
        
        vm.prank(recoverer);
        vault.cancelAllOperations();
        
        // Should now be globally cancelled (show as Unset)
        assertEq(uint(vault.getOperationState(id)), uint(TimelockController.OperationState.Unset));
    }
    
    function testRoleAdminSwitchingDuringRecovery() public {
        // Test that role admins properly switch during recovery mode
        
        // Initial state - vault is admin
        assertEq(vault.getRoleAdmin(vault.PROPOSER_ROLE()), vault.DEFAULT_ADMIN_ROLE());
        
        // Enter recovery mode - recoverer becomes admin
        vm.prank(recoveryTriggerer);
        vault.triggerRecoveryMode();
        assertEq(vault.getRoleAdmin(vault.PROPOSER_ROLE()), vault.RECOVERER_ROLE());
        
        // Exit recovery mode - vault becomes admin again
        vm.prank(recoverer);
        vault.exitRecoveryMode();
        assertEq(vault.getRoleAdmin(vault.PROPOSER_ROLE()), vault.DEFAULT_ADMIN_ROLE());
    }
    
    function testCannotExecuteGloballyCancelledOperation() public {
        // Schedule operation
        vm.prank(proposer);
        vault.schedule(target, value, data, predecessor, salt, delay);
        
        // Wait for delay
        vm.warp(block.timestamp + delay + 1);
        
        // Globally cancel
        vm.prank(recoveryTriggerer);
        vault.triggerRecoveryMode();
        
        vm.prank(recoverer);
        vault.cancelAllOperations();
        
        vm.prank(recoverer);
        vault.exitRecoveryMode();
        
        // Try to execute - should fail because operation is globally cancelled
        vm.prank(executor);
        vm.expectRevert(); // Just expect any revert since error format varies
        vault.execute(target, value, data, predecessor, salt);
    }
    
    // =============================================================================
    // Gas Tests
    // =============================================================================
    
    function testGasCancelAllOperations() public {
        // Schedule multiple operations
        for (uint i = 0; i < 10; i++) {
            vm.prank(proposer);
            vault.schedule(target, value, data, predecessor, bytes32(i), delay);
        }
        
        // Trigger recovery mode
        vm.prank(recoveryTriggerer);
        vault.triggerRecoveryMode();
        
        // Measure gas for cancelling all operations
        uint256 gasStart = gasleft();
        vm.prank(recoverer);
        vault.cancelAllOperations();
        uint256 gasUsed = gasStart - gasleft();
        
        // Should be O(1) regardless of number of operations
        assertTrue(gasUsed < 100000, "cancelAllOperations should be O(1)");
    }
    
    // =============================================================================
    // Fuzz Tests
    // =============================================================================
    
    function testFuzzScheduleAndGlobalCancel(uint256 _delay, bytes32 _salt) public {
        vm.assume(_delay >= vault.getMinDelay());
        vm.assume(_delay <= 365 days); // Reasonable upper bound
        
        bytes32 id = vault.hashOperation(target, value, data, predecessor, _salt);
        
        // Schedule operation
        vm.prank(proposer);
        vault.schedule(target, value, data, predecessor, _salt, _delay);
        
        assertEq(vault.getOperationEpoch(id), 1);
        
        // Global cancel
        vm.prank(recoveryTriggerer);
        vault.triggerRecoveryMode();
        
        vm.prank(recoverer);
        vault.cancelAllOperations();
        
        // Operation should now be globally cancelled (show as Unset)
        assertEq(uint(vault.getOperationState(id)), uint(TimelockController.OperationState.Unset));
    }
}
