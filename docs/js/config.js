// config.js - Configuration constants and settings

// Contract configuration - starts empty, user will set via UI
const CONTRACT_ADDRESS = ''; // Will be loaded from localStorage or set by user

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
    "event RecoveryModeTriggered(address indexed recoveryTriggerer, uint256 currentEpoch)",
    "event RecoveryModeExited(address indexed recoverer, uint256 currentEpoch)",
    "event AllOperationsCancelled(uint256 newEpoch, address indexed canceller)",
    "event RecoveryExecution(address indexed recoverer, address indexed target, uint256 value, bytes data)"
];

// ERC20 ABI for token balance queries
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)"
];

// Token lists by chain ID
const TOKENS_BY_CHAIN = {
    // Ethereum Mainnet (Chain ID: 1)
    1: [
        { name: "USD Coin", symbol: "USDC", address: "0xA0b86a33E6441D435a3CdA2dB1cf4A25E23Fbc6A", decimals: 6 },
        { name: "Wrapped Ether", symbol: "WETH", address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", decimals: 18 },
        { name: "Tether USD", symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
        { name: "Dai Stablecoin", symbol: "DAI", address: "0x6B175474E89094C44Da98b954EedeAC495271d0F", decimals: 18 }
    ],
    
    // Arbitrum One (Chain ID: 42161)
    42161: [
        { name: "USD Coin", symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
        { name: "Wrapped Ether", symbol: "WETH", address: "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", decimals: 18 },
        { name: "Tether USD", symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
        { name: "Arbitrum", symbol: "ARB", address: "0x912CE59144191C1204E64559FE8253a0e49E6548", decimals: 18 }
    ],
    
    // Polygon (Chain ID: 137)
    137: [
        { name: "USD Coin", symbol: "USDC", address: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", decimals: 6 },
        { name: "Wrapped Ether", symbol: "WETH", address: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", decimals: 18 },
        { name: "Wrapped Matic", symbol: "WMATIC", address: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", decimals: 18 },
        { name: "Tether USD", symbol: "USDT", address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", decimals: 6 }
    ],
    
    // Base (Chain ID: 8453)
    8453: [
        { name: "USD Coin", symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 },
        { name: "Wrapped Ether", symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
        { name: "Dai Stablecoin", symbol: "DAI", address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", decimals: 18 }
    ],
    
    // Localhost/Hardhat (Chain ID: 31337) - Test tokens
    31337: [
        { name: "Dancoin", symbol: "DAN", address: "0xbdEd0D2bf404bdcBa897a74E6657f1f12e5C6fb6", decimals: 18 },
        { name: "GoldToken", symbol: "GOLD", address: "0xA7918D253764E42d60C3ce2010a34d5a1e7C1398", decimals: 18 },
        { name: "AnnoyingDecimals", symbol: "FU", address: "0x71a9d115E322467147391c4a71D85F8e1cA623EF", decimals: 6 }
    ],
    
    // Sepolia Testnet (Chain ID: 11155111) - Test tokens
    11155111: [
        { name: "Test USD Coin", symbol: "USDC", address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238", decimals: 6 },
        { name: "Test Wrapped Ether", symbol: "WETH", address: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14", decimals: 18 }
    ]
};

// Network information
const NETWORK_INFO = {
    1: { name: "Ethereum Mainnet", shortName: "Ethereum" },
    42161: { name: "Arbitrum One", shortName: "Arbitrum" },
    137: { name: "Polygon", shortName: "Polygon" },
    8453: { name: "Base", shortName: "Base" },
    31337: { name: "Localhost", shortName: "Localhost" },
    11155111: { name: "Sepolia Testnet", shortName: "Sepolia" }
};

// Function to update tokens based on current chain
function updateTokensForChain(chainId) {
    const tokens = TOKENS_BY_CHAIN[chainId] || [];
    SUPPORTED_TOKENS.length = 0; // Clear current array
    SUPPORTED_TOKENS.push(...tokens); // Add new tokens
    
    console.log(`Updated tokens for chain ${chainId} (${NETWORK_INFO[chainId]?.name || 'Unknown'}):`, tokens.length, 'tokens');
    return tokens;
}

// Function to get current chain info
function getCurrentChainInfo(chainId) {
    return NETWORK_INFO[chainId] || { name: `Unknown Chain (${chainId})`, shortName: `Chain ${chainId}` };
}

// Function to add token to current chain
function addTokenToCurrentChain(chainId, tokenInfo) {
    if (!TOKENS_BY_CHAIN[chainId]) {
        TOKENS_BY_CHAIN[chainId] = [];
    }
    
    // Check if token already exists
    const existingToken = TOKENS_BY_CHAIN[chainId].find(token => 
        token.address.toLowerCase() === tokenInfo.address.toLowerCase()
    );
    
    if (existingToken) {
        return false; // Token already exists
    }
    
    // Add to chain-specific list
    TOKENS_BY_CHAIN[chainId].push(tokenInfo);
    
    // Update current SUPPORTED_TOKENS if this is the current chain
    updateTokensForChain(chainId);
    
    return true; // Successfully added
}

// Function to remove token from current chain
function removeTokenFromCurrentChain(chainId, tokenIndex) {
    if (!TOKENS_BY_CHAIN[chainId] || tokenIndex >= TOKENS_BY_CHAIN[chainId].length) {
        return false;
    }
    
    // Remove from chain-specific list
    const removedToken = TOKENS_BY_CHAIN[chainId].splice(tokenIndex, 1)[0];
    
    // Update current SUPPORTED_TOKENS if this is the current chain
    updateTokensForChain(chainId);
    
    return removedToken;
}

// Initialize SUPPORTED_TOKENS with default chain (localhost for development)
let SUPPORTED_TOKENS = [...(TOKENS_BY_CHAIN[31337] || [])];

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
    TOKENS_BY_CHAIN,
    NETWORK_INFO,
    ROLES_CONFIG,
    RECOVERY_ROLES_CONFIG,
    UI_CONFIG,
    // Token management functions
    updateTokensForChain,
    getCurrentChainInfo,
    addTokenToCurrentChain,
    removeTokenFromCurrentChain
};

// Also make individual constants available for backward compatibility
window.CONTRACT_ADDRESS = CONTRACT_ADDRESS;
window.CONTRACT_ABI = CONTRACT_ABI;
window.ERC20_ABI = ERC20_ABI;
window.SUPPORTED_TOKENS = SUPPORTED_TOKENS;
