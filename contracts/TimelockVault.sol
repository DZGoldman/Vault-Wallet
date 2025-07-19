// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/governance/TimelockController.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TimelockVault
 * @dev A timelock vault with recovery mode functionality.
 * Inherits from OpenZeppelin's TimelockController and adds recovery mode features.
 */
contract TimelockVault is TimelockController, ReentrancyGuard {
    // Role definitions
    bytes32 public constant RECOVERY_TRIGGER_ROLE = keccak256("RECOVERY_TRIGGER_ROLE");
    bytes32 public constant RECOVERER_ROLE = keccak256("RECOVERER_ROLE");
    
    // State variables
    bool public recoveryMode;
    address public currentProposer;
    address public currentRecoveryTriggerer;
    
    // Modifiers
    modifier whenNotInRecoveryMode() {
        require(!recoveryMode, "TimelockVault: Cannot perform operation in recovery mode");
        _;
    }
    
    modifier whenInRecoveryMode() {
        require(recoveryMode, "TimelockVault: Not in recovery mode");
        _;
    }
    
    // Events
    event RecoveryModeTriggered(address indexed triggerer);
    event RecoveryModeExited(address indexed recoverer, address indexed newProposer, address indexed newTriggerer);
    event OperationCancelled(bytes32 indexed id, address indexed canceller);
    
    /**
     * @dev Constructor initializes the timelock with specified roles
     * @param minDelay Minimum delay for operations
     * @param proposers Array of proposer addresses
     * @param executors Array of executor addresses (empty array means anyone can execute)
     * @param recoveryTriggerer Initial recovery triggerer address
     * @param recoverer Initial recoverer address
     */
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address recoveryTriggerer,
        address recoverer
    ) TimelockController(minDelay, proposers, executors, address(0)) {
        // Grant recovery roles
        _grantRole(RECOVERY_TRIGGER_ROLE, recoveryTriggerer);
        _grantRole(RECOVERER_ROLE, recoverer);
        
 

        
        // Store initial roles for recovery mode exit
        require(proposers.length == 1, "TimelockVault: There must be exactly one proposer");
        currentProposer = proposers[0]; // Assuming single proposer for simplicity
        currentRecoveryTriggerer = recoveryTriggerer;
    }
    
    /**
     * @dev Triggers recovery mode. Only callable by RECOVERY_TRIGGER_ROLE.
     * In recovery mode, no operations can be scheduled or executed.
     */
    function triggerRecoveryMode() external onlyRole(RECOVERY_TRIGGER_ROLE) whenNotInRecoveryMode {
        recoveryMode = true;
        emit RecoveryModeTriggered(msg.sender);
    }
    
    /**
     * @dev Exits recovery mode and resets proposer and recovery triggerer roles.
     * Only callable by RECOVERER_ROLE when in recovery mode.
     * @param newProposer New proposer address
     * @param newTriggerer New recovery triggerer address
     */
    function exitRecoveryMode(
        address newProposer,
        address newTriggerer
    ) external onlyRole(RECOVERER_ROLE) whenInRecoveryMode nonReentrant {
        require(newProposer != address(0), "TimelockVault: Invalid new proposer");
        require(newTriggerer != address(0), "TimelockVault: Invalid new triggerer");
        
        // Reset proposer role - revoke current proposer and grant to new proposer
        _revokeRole(PROPOSER_ROLE, currentProposer);
        _grantRole(PROPOSER_ROLE, newProposer);
        
        // Reset recovery triggerer role - revoke current triggerer and grant to new triggerer
        _revokeRole(RECOVERY_TRIGGER_ROLE, currentRecoveryTriggerer);
        _grantRole(RECOVERY_TRIGGER_ROLE, newTriggerer);
        
        // Update stored roles
        currentProposer = newProposer;
        currentRecoveryTriggerer = newTriggerer;
        
        // Exit recovery mode
        recoveryMode = false;
        
        emit RecoveryModeExited(msg.sender, newProposer, newTriggerer);
    }
    
    /**
     * @dev Override schedule function to prevent scheduling in recovery mode
     */
    function schedule(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt,
        uint256 delay
    ) public override onlyRole(PROPOSER_ROLE) whenNotInRecoveryMode {
        super.schedule(target, value, data, predecessor, salt, delay);
    }
    
    /**
     * @dev Override scheduleBatch function to prevent scheduling in recovery mode
     */
    function scheduleBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata payloads,
        bytes32 predecessor,
        bytes32 salt,
        uint256 delay
    ) public override onlyRole(PROPOSER_ROLE) whenNotInRecoveryMode {
        super.scheduleBatch(targets, values, payloads, predecessor, salt, delay);
    }
    
    /**
     * @dev Override execute function to prevent execution in recovery mode
     */
    function execute(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt
    ) public payable override whenNotInRecoveryMode {
        super.execute(target, value, data, predecessor, salt);
    }
    
    /**
     * @dev Override executeBatch function to prevent execution in recovery mode
     */
    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata payloads,
        bytes32 predecessor,
        bytes32 salt
    ) public payable override whenNotInRecoveryMode {
        super.executeBatch(targets, values, payloads, predecessor, salt);
    }
    
    /**
     * @dev Override cancel function to allow cancellation by proposers or recovery triggerer
     */
    function cancel(bytes32 id) public override {
        require(
            hasRole(PROPOSER_ROLE, msg.sender) || hasRole(RECOVERY_TRIGGER_ROLE, msg.sender),
            "TimelockVault: Caller is not proposer or recovery triggerer"
        );
        super.cancel(id);
        emit OperationCancelled(id, msg.sender);
    }
    

} 