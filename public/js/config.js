// config.js - Configuration constants and settings

// Contract configuration - update these after deployment
const CONTRACT_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3'; // Update with your deployed contract address

const CONTRACT_ABI = [
    // TimelockController functions we need
    "function getMinDelay() view returns (uint256)",
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function getRoleAdmin(bytes32 role) view returns (bytes32)",
    "function schedule(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt, uint256 delay)",
    "function cancel(bytes32 id)",
    "function execute(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt)",
    "function executeBatch(address[] calldata targets, uint256[] calldata values, bytes[] calldata payloads, bytes32 predecessor, bytes32 salt)",
    "function hashOperation(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt) pure returns (bytes32)",
    "function getOperationState(bytes32 id) view returns (uint8)",
    "function getTimestamp(bytes32 id) view returns (uint256)",
    "function isOperation(bytes32 id) view returns (bool)",
    "function isOperationPending(bytes32 id) view returns (bool)",
    "function isOperationReady(bytes32 id) view returns (bool)",
    "function isOperationDone(bytes32 id) view returns (bool)",
    
    // TimelockVault specific functions
    "function recoveryMode() view returns (bool)",
    "function currentRecoveryEpoch() view returns (uint256)",
    "function triggerRecoveryMode()",
    "function exitRecoveryMode()",
    "function cancelAllOperations()",
    "function recoveryExecute(address target, uint256 value, bytes calldata data) payable",
    
    // Role management functions
    "function grantRole(bytes32 role, address account)",
    "function revokeRole(bytes32 role, address account)",
    
    // Role constants
    "function PROPOSER_ROLE() view returns (bytes32)",
    "function EXECUTOR_ROLE() view returns (bytes32)",
    "function CANCELLER_ROLE() view returns (bytes32)",
    "function RECOVERY_TRIGGER_ROLE() view returns (bytes32)",
    "function RECOVERER_ROLE() view returns (bytes32)",
    
    // Events for role enumeration
    "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
    "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
    
    // TimelockController events
    "event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)",
    "event CallExecuted(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data)",
    "event CallSalt(bytes32 indexed id, bytes32 salt)",
    "event Cancelled(bytes32 indexed id)",
    
    // TimelockVault recovery events
    "event RecoveryExecution(address indexed recoverer, address indexed target, uint256 value, bytes data)"
];

// ERC20 ABI for token balance queries
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)"
];

// Token list with deployed test tokens
const SUPPORTED_TOKENS = [
    // { name: "Dancoin", symbol: "DAN", address: "0xbdEd0D2bf404bdcBa897a74E6657f1f12e5C6fb6", decimals: 18 },
    { name: "GoldToken", symbol: "GOLD", address: "0xA7918D253764E42d60C3ce2010a34d5a1e7C1398", decimals: 18 },
    { name: "AnnoyingDecimals", symbol: "FU", address: "0x71a9d115E322467147391c4a71D85F8e1cA623EF", decimals: 6 }
];

// Role configuration for UI management
const ROLES_CONFIG = [
    { name: 'proposers', roleFunction: 'PROPOSER_ROLE', listId: 'proposersList', loadingId: 'proposersLoading' },
    { name: 'executors', roleFunction: 'EXECUTOR_ROLE', listId: 'executorsList', loadingId: 'executorsLoading' },
    { name: 'cancellers', roleFunction: 'CANCELLER_ROLE', listId: 'cancellersList', loadingId: 'cancellersLoading' },
    { name: 'recoveryTriggerers', roleFunction: 'RECOVERY_TRIGGER_ROLE', listId: 'recoveryTriggerersList', loadingId: 'recoveryTriggerersLoading' },
    { name: 'recoverers', roleFunction: 'RECOVERER_ROLE', listId: 'recoverersList', loadingId: 'recoverersLoading' }
];

// Recovery roles configuration for role management tab
const RECOVERY_ROLES_CONFIG = [
    { name: 'Proposers', roleFunction: 'PROPOSER_ROLE' },
    { name: 'Executors', roleFunction: 'EXECUTOR_ROLE' },
    { name: 'Cancellers', roleFunction: 'CANCELLER_ROLE' },
    { name: 'Recovery Triggerers', roleFunction: 'RECOVERY_TRIGGER_ROLE' },
    { name: 'Recoverers', roleFunction: 'RECOVERER_ROLE' }
];

// UI Configuration
const UI_CONFIG = {
    // Auto-refresh intervals (in milliseconds)
    BALANCE_REFRESH_INTERVAL: 30000, // 30 seconds
    OPERATIONS_REFRESH_INTERVAL: 10000, // 10 seconds
    
    // Error message display duration
    ERROR_DISPLAY_DURATION: 5000, // 5 seconds
    SUCCESS_DISPLAY_DURATION: 8000, // 8 seconds
    
    // Token validation settings
    MAX_ETHERS_LOAD_ATTEMPTS: 20,
    ETHERS_LOAD_CHECK_INTERVAL: 100, // milliseconds
    
    // MetaMask URLs
    METAMASK_INSTALL_URL: 'https://metamask.io/download/',
    
    // Number formatting
    MAX_TOKEN_DECIMALS_DISPLAY: 6
};

// Make configuration available globally
window.CONFIG = {
    CONTRACT_ADDRESS,
    CONTRACT_ABI,
    ERC20_ABI,
    SUPPORTED_TOKENS,
    ROLES_CONFIG,
    RECOVERY_ROLES_CONFIG,
    UI_CONFIG
};

// Also make individual constants available for backward compatibility
window.CONTRACT_ADDRESS = CONTRACT_ADDRESS;
window.CONTRACT_ABI = CONTRACT_ABI;
window.ERC20_ABI = ERC20_ABI;
window.SUPPORTED_TOKENS = SUPPORTED_TOKENS;
