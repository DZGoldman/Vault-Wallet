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
    // Custom errors
    error CannotPerformOperationInRecoveryMode();
    error NotInRecoveryMode();
    error CallerIsNotRecoverer(address caller);
    error CallerNotAuthorizedToCancel(address caller, bytes32 operationId);
    
    // Role definitions
    bytes32 public constant RECOVERY_TRIGGER_ROLE = keccak256("RECOVERY_TRIGGER_ROLE");
    bytes32 public constant RECOVERER_ROLE = keccak256("RECOVERER_ROLE");
    
    // State variables
    bool public recoveryMode;
    
    // Epoch-based global cancellation
    uint256 public currentRecoveryEpoch = 1; // Start at 1 to avoid epoch 0 issues
    mapping(bytes32 => uint256) private _operationEpochs;
    
    // Modifiers
    modifier whenNotInRecoveryMode() {
        if (recoveryMode) revert CannotPerformOperationInRecoveryMode();
        _;
    }
    
    modifier whenInRecoveryMode() {
        if (!recoveryMode) revert NotInRecoveryMode();
        _;
    }
    
    modifier onlyRecovererInRecoveryMode() {
        if (!recoveryMode) revert NotInRecoveryMode();
        if (!hasRole(RECOVERER_ROLE, msg.sender)) revert CallerIsNotRecoverer(msg.sender);
        _;
    }
    
    // Events
    event RecoveryModeTriggered(address indexed triggerer, uint256 currentEpoch);
    event RecoveryModeExited(address indexed recoverer, uint256 currentEpoch);
    event OperationCancelled(bytes32 indexed id, address indexed canceller);
    event AllOperationsCancelled(uint256 newEpoch, address indexed canceller);
    event RecoveryExecution(address indexed recoverer, address indexed target, uint256 value, bytes data);
    
    /**
     * @dev Constructor initializes the timelock with specified roles
     * @param minDelay Minimum delay for operations
     * @param proposers Array of proposer addresses
     * @param executors Array of executor addresses (empty array means anyone can execute)
     * @param recoveryTriggerers Array of recovery triggerer addresses
     * @param recoverers Array of recoverer addresses
     */
    constructor(
        uint256 minDelay,
        address[] memory proposers,
        address[] memory executors,
        address[] memory recoveryTriggerers,
        address[] memory recoverers
    ) TimelockController(minDelay, proposers, executors, address(0)) {

        // Vault is set as default admin for all roles in TimelockController; i.e., roles can change via timelock.
        // TimelockController also sets executors, proposers, and cancellors (to be the initial proposers).

        // Grant recovery trigger roles
        for (uint256 i = 0; i < recoveryTriggerers.length; ++i) {
            _grantRole(RECOVERY_TRIGGER_ROLE, recoveryTriggerers[i]);
        }

        // Grant recoverer roles
        for (uint256 i = 0; i < recoverers.length; ++i) {
            _grantRole(RECOVERER_ROLE, recoverers[i]);
        }
    }
    
    /**
     * @dev Triggers recovery mode. Only callable by RECOVERY_TRIGGER_ROLE.
     * In recovery mode, no operations can be scheduled or executed.
     */
    function triggerRecoveryMode() external onlyRole(RECOVERY_TRIGGER_ROLE) whenNotInRecoveryMode {
        recoveryMode = true;
        
        emit RecoveryModeTriggered(msg.sender, currentRecoveryEpoch);
    }
    
    /**
     * @dev Exits recovery mode and restores normal role admin structure.
     * Only callable by RECOVERER_ROLE when in recovery mode.
     */
    function exitRecoveryMode() external onlyRecovererInRecoveryMode {
        recoveryMode = false;

        emit RecoveryModeExited(msg.sender, currentRecoveryEpoch);
    }
    
    /**
     * @dev Cancels all pending operations globally by incrementing the recovery epoch.
     * Only callable by RECOVERER_ROLE when in recovery mode.
     * All operations from previous epochs become invalid.
     */
    function cancelAllOperations() external onlyRecovererInRecoveryMode {
        // Increment epoch - this invalidates ALL pending operations from previous epochs
        currentRecoveryEpoch++;

        emit AllOperationsCancelled(currentRecoveryEpoch, msg.sender);
    }
    
    /**
     * @dev Execute an operation during recovery mode. Only callable by RECOVERER_ROLE when in recovery mode.
     * Allows recoverers to execute critical operations even when normal execution is blocked.
     * Can execute any operation including timelock operations such as role management (grantRole/revokeRole)
     * by targeting the vault itself (address(this)). This enables recoverers to manage roles and perform
     * governance actions during recovery without needing special role admin privileges.
     */
    function recoveryExecute(
        address target,
        uint256 value,
        bytes calldata data
    ) public payable onlyRecovererInRecoveryMode {
        _execute(target, value, data);
        emit RecoveryExecution(msg.sender, target, value, data);
    }
    
    /**
     * @dev Execute a batch of operations during recovery mode. Only callable by RECOVERER_ROLE when in recovery mode.
     * Allows recoverers to execute critical batch operations even when normal execution is blocked.
     */
    function recoveryExecuteBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata payloads
    ) public payable onlyRecovererInRecoveryMode {
        require(targets.length == values.length, "TimelockController: length mismatch");
        require(targets.length == payloads.length, "TimelockController: length mismatch");

        for (uint256 i = 0; i < targets.length; ++i) {
            _execute(targets[i], values[i], payloads[i]);
            emit RecoveryExecution(msg.sender, targets[i], values[i], payloads[i]);
        }
    }
    
    /**
     * @dev Override getOperationState to handle globally cancelled operations
     * @param id The operation ID to check
     * @return The operation state (Unset if globally cancelled, otherwise from parent)
     */
     function getOperationState(bytes32 id) public override view virtual returns (OperationState) {
        // First check the parent state
        OperationState parentState = super.getOperationState(id);
        
        // If the operation is done or unset in parent, always trust the parent
        // This preserves executed operations and individually cancelled operations
        if (parentState == OperationState.Done || parentState == OperationState.Unset) {
            return parentState;
        }
        
        // For waiting/ready operations, check if they're from a previous epoch (globally cancelled)
        if (_operationEpochs[id] < currentRecoveryEpoch) {
            return OperationState.Unset;
        }
        
        // Operation is from current epoch and pending, return parent state
        return parentState;

    }

    /**
     * @dev Get the epoch when an operation was scheduled
     * @param id The operation ID to check
     * @return The epoch number (0 if never scheduled, ≥1 if scheduled)
     */
    function getOperationEpoch(bytes32 id) public view returns (uint256) {
        return _operationEpochs[id];
    }



    /**
     * @dev Override schedule function with epoch tracking and prevent scheduling in recovery mode
     */
    function schedule(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt,
        uint256 delay
    ) public override onlyRole(PROPOSER_ROLE) whenNotInRecoveryMode {
        bytes32 id = hashOperation(target, value, data, predecessor, salt);
        
        // Tag operation with current epoch
        _operationEpochs[id] = currentRecoveryEpoch;
        
        super.schedule(target, value, data, predecessor, salt, delay);
    }
    
    /**
     * @dev Override scheduleBatch function with epoch tracking and prevent scheduling in recovery mode
     */
    function scheduleBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata payloads,
        bytes32 predecessor,
        bytes32 salt,
        uint256 delay
    ) public override onlyRole(PROPOSER_ROLE) whenNotInRecoveryMode {
        bytes32 id = hashOperationBatch(targets, values, payloads, predecessor, salt);
        
        // Tag batch operation with current epoch
        _operationEpochs[id] = currentRecoveryEpoch;
        
        super.scheduleBatch(targets, values, payloads, predecessor, salt, delay);
    }
    
    /**
     * @dev Override execute function and prevent execution in recovery mode
     * Note: Epoch tracking is preserved permanently (no cleanup after execution)
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
     * @dev Override executeBatch function and prevent execution in recovery mode  
     * Note: Epoch tracking is preserved permanently (no cleanup after execution)
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
    


} 