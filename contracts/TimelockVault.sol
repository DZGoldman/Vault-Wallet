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
    error OperationNotGloballyCancelled(bytes32 operationId, uint256 operationEpoch, uint256 currentEpoch);
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
     * @dev Internal function to set role admins for all timelock roles
     * @param roleAdmin The role to set as admin for all timelock roles
     */
    function _setTimelockRoleAdmins(bytes32 roleAdmin) internal {
        _setRoleAdmin(PROPOSER_ROLE, roleAdmin);
        _setRoleAdmin(RECOVERY_TRIGGER_ROLE, roleAdmin);
        _setRoleAdmin(EXECUTOR_ROLE, roleAdmin);
        _setRoleAdmin(CANCELLER_ROLE, roleAdmin);
    }
    
    /**
     * @dev Triggers recovery mode. Only callable by RECOVERY_TRIGGER_ROLE.
     * In recovery mode, no operations can be scheduled or executed.
     */
    function triggerRecoveryMode() external onlyRole(RECOVERY_TRIGGER_ROLE) whenNotInRecoveryMode {
        recoveryMode = true;
        // Set RECOVERER_ROLE as the role admin for all timelock roles
        _setTimelockRoleAdmins(RECOVERER_ROLE);
        
        emit RecoveryModeTriggered(msg.sender, currentRecoveryEpoch);
    }
    
    /**
     * @dev Exits recovery mode. Only flips the recovery mode flag.
     * Role management should be done separately through AccessControl functions.
     */
    function exitRecoveryMode() external onlyRecovererInRecoveryMode {
        recoveryMode = false;
        // Set vault as the role admin for all timelock roles
        _setTimelockRoleAdmins(DEFAULT_ADMIN_ROLE);

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
    

     function getOperationState(bytes32 id) public override view virtual returns (OperationState) {
        if (isOperationGloballyCancelled(id)) {
            return OperationState.Unset;
        }
        return super.getOperationState(id);

    }

    /**
     * @dev Get the epoch when an operation was scheduled
     */
    function getOperationEpoch(bytes32 id) public view returns (uint256) {
        return _operationEpochs[id];
    }

    /**
     * @dev Check if an operation was globally cancelled (from old epoch)
     */
    function isOperationGloballyCancelled(bytes32 id) public view returns (bool) {
        return  _operationEpochs[id] < currentRecoveryEpoch;
    }

    /**
     * @dev Clean up globally cancelled operation storage (anyone can call)
     * Saves gas by cleaning up old epoch data
     */
    function cleanupGloballyCancelledOperation(bytes32 id) external {
        if (!isOperationGloballyCancelled(id)) {
            revert OperationNotGloballyCancelled(id, _operationEpochs[id], currentRecoveryEpoch);
        }
        delete _operationEpochs[id];
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
     * @dev Override execute function with epoch validation and prevent execution in recovery mode
     */
    function execute(
        address target,
        uint256 value,
        bytes calldata data,
        bytes32 predecessor,
        bytes32 salt
    ) public payable override whenNotInRecoveryMode {
        bytes32 id = hashOperation(target, value, data, predecessor, salt);

        super.execute(target, value, data, predecessor, salt);
        
        // Clean up epoch tracking after successful execution
        delete _operationEpochs[id];
    }
    
    /**
     * @dev Override executeBatch function with epoch validation and prevent execution in recovery mode
     */
    function executeBatch(
        address[] calldata targets,
        uint256[] calldata values,
        bytes[] calldata payloads,
        bytes32 predecessor,
        bytes32 salt
    ) public payable override whenNotInRecoveryMode {
        bytes32 id = hashOperationBatch(targets, values, payloads, predecessor, salt);
        
        super.executeBatch(targets, values, payloads, predecessor, salt);
        
        // Clean up epoch tracking after successful execution
        delete _operationEpochs[id];
    }
    

} 