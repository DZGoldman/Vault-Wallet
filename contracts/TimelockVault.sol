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
    
    // Epoch-based global cancellation
    uint256 public currentRecoveryEpoch;
    mapping(bytes32 => uint256) private _operationEpochs;
    
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
    event RecoveryModeTriggered(address indexed triggerer, uint256 newEpoch);
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
     * @dev Triggers recovery mode and cancels all pending operations globally.
     * Only callable by RECOVERY_TRIGGER_ROLE.
     * In recovery mode, no operations can be scheduled or executed.
     * All operations from previous epochs become invalid.
     */
    function triggerRecoveryMode() external onlyRole(RECOVERY_TRIGGER_ROLE) whenNotInRecoveryMode {
        recoveryMode = true;
        
        // Increment epoch - this invalidates ALL pending operations from previous epochs
        currentRecoveryEpoch++;
        
        emit RecoveryModeTriggered(msg.sender, currentRecoveryEpoch);
    }
    
    /**
     * @dev Exits recovery mode and resets roles. Operations scheduled before recovery
     * remain globally cancelled. New operations will use the new epoch.
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
        
        // Exit recovery mode (epoch remains incremented - old operations stay cancelled)
        recoveryMode = false;
        
        emit RecoveryModeExited(msg.sender, newProposer, newTriggerer);
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
        return _operationEpochs[id] != 0 && _operationEpochs[id] < currentRecoveryEpoch;
    }

    /**
     * @dev Clean up globally cancelled operation storage (anyone can call)
     * Saves gas by cleaning up old epoch data
     */
    function cleanupGloballyCancelledOperation(bytes32 id) external {
        require(isOperationGloballyCancelled(id), "TimelockVault: Operation not globally cancelled");
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
    
    /**
     * @dev Override cancel function to allow cancellation by proposers or recovery triggerer
     * and clean up epoch tracking
     */
    function cancel(bytes32 id) public override {
        require(
            hasRole(PROPOSER_ROLE, msg.sender) || hasRole(RECOVERY_TRIGGER_ROLE, msg.sender),
            "TimelockVault: Caller is not proposer or recovery triggerer"
        );
        // Clean up epoch tracking
        delete _operationEpochs[id];
        
        super.cancel(id);
        emit OperationCancelled(id, msg.sender);
    }
    

} 