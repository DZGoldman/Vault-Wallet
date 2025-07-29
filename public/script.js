// Wait for ethers to load
function waitForEthers() {
    return new Promise((resolve, reject) => {
        if (typeof ethers !== 'undefined') {
            console.log('Ethers loaded successfully');
            resolve();
            return;
        }
        
        let attempts = 0;
        const checkEthers = setInterval(() => {
            attempts++;
            console.log(`Waiting for ethers.js to load, attempt ${attempts}`);
            
            if (typeof ethers !== 'undefined') {
                console.log('Ethers loaded successfully after waiting');
                clearInterval(checkEthers);
                resolve();
            } else if (attempts >= 20) {
                console.error('Failed to load ethers.js after 20 attempts');
                clearInterval(checkEthers);
                reject(new Error('Failed to load ethers.js'));
            }
        }, 100);
    });
}

// Contract configuration - you'll need to update these after deployment
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
    "event Cancelled(bytes32 indexed id)"
];

// ERC20 ABI for token balance queries
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)"
];

let provider;
let contract;
let currentUserAddress = null; // Track current connected user
let autoRefreshInterval = null;
let balanceRefreshInterval = null;
let isInRecoveryMode = false; // Track recovery mode status

// Persistent event data for efficient incremental loading
let lastQueriedBlock = 0;
let allScheduledEvents = [];
let allExecutedEvents = [];
let allCancelledEvents = [];
let allSaltEvents = [];
let lastEventsHash = null;
let lastOperationStatesHash = null;

// DOM elements
const connectButton = document.getElementById('connectWallet');
const disconnectButton = document.getElementById('disconnectWallet');
const connectionStatus = document.getElementById('connectionStatus');
const contractInfo = document.getElementById('contract-info');
const errorSection = document.getElementById('error-section');
const errorMessage = document.getElementById('errorMessage');
const proposeButton = document.getElementById('proposeTransaction');
const proposalStatus = document.getElementById('proposalStatus');
const refreshOperationsButton = document.getElementById('refreshOperations');
const operationsCount = document.getElementById('operationsCount');
const operationsLoading = document.getElementById('operationsLoading');
const operationsList = document.getElementById('operationsList');
const noOperations = document.getElementById('noOperations');

// Tab elements
const rawTransactionTab = document.getElementById('rawTransactionTab');
const tokenTransferTab = document.getElementById('tokenTransferTab');
const rawTransactionPanel = document.getElementById('rawTransactionPanel');
const tokenTransferPanel = document.getElementById('tokenTransferPanel');

// Token transfer elements
const tokenAddress = document.getElementById('tokenAddress');
const tokenSelect = document.getElementById('tokenSelect');
const tokenTo = document.getElementById('tokenTo');
const tokenAmount = document.getElementById('tokenAmount');
const tokenSalt = document.getElementById('tokenSalt');
const tokenDelay = document.getElementById('tokenDelay');
const proposeTokenTransferButton = document.getElementById('proposeTokenTransfer');
const tokenInfo = document.getElementById('tokenInfo');
const tokenError = document.getElementById('tokenError');
const tokenAmountHelp = document.getElementById('tokenAmountHelp');

// Recovery trigger button
const recoveryTriggerButton = document.getElementById('triggerRecovery');

// Token list with deployed test tokens
const SUPPORTED_TOKENS = [
    // { name: "Dancoin", symbol: "DAN", address: "0xbdEd0D2bf404bdcBa897a74E6657f1f12e5C6fb6", decimals: 18 },
    { name: "GoldToken", symbol: "GOLD", address: "0xA7918D253764E42d60C3ce2010a34d5a1e7C1398", decimals: 18 },
    { name: "AnnoyingDecimals", symbol: "FU", address: "0x71a9d115E322467147391c4a71D85F8e1cA623EF", decimals: 6 }
];

// Check if wallet is available on page load
async function checkWallet() {
    console.log('Checking wallet...', typeof window.ethereum);
    
    if (typeof window.ethereum !== 'undefined') {
        console.log('MetaMask detected');
        connectionStatus.classList.remove('loading');
        connectionStatus.textContent = 'Wallet detected - Click to connect';
        connectButton.textContent = 'Connect Wallet';
        
        // Remove any existing event listeners to avoid duplicates
        connectButton.removeEventListener('click', openMetaMaskInstall);
        
        // Check if already connected
        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            if (accounts.length > 0) {
                console.log('Already connected to accounts:', accounts);
                // Already connected - connect with current account
                await connectWallet();
            }
        } catch (error) {
            console.log('Error checking existing connection:', error);
        }
    } else {
        console.log('MetaMask not detected');
        connectionStatus.classList.remove('loading');
        connectionStatus.textContent = 'No wallet detected - Please install MetaMask';
        connectButton.textContent = 'Install MetaMask';
        
        // Remove the connect wallet listener and add install listener
        connectButton.removeEventListener('click', connectWallet);
        connectButton.addEventListener('click', openMetaMaskInstall);
    }
}

// Function to open MetaMask install page
function openMetaMaskInstall() {
    window.open('https://metamask.io/download/', '_blank');
}

// Connect wallet function
async function connectWallet() {
    try {
        // First make sure ethers is loaded
        await waitForEthers();
        
        if (typeof window.ethereum === 'undefined') {
            showError('MetaMask is not installed. Please install MetaMask to use this interface.');
            return;
        }

        // Request account access
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        
        if (accounts.length === 0) {
            showError('No accounts found. Please make sure MetaMask is unlocked.');
            return;
        }

        provider = new ethers.providers.Web3Provider(window.ethereum);
        const signer = provider.getSigner();
        const userAddress = await signer.getAddress();
        currentUserAddress = userAddress; // Store current user address
        console.log('userAddress', userAddress);
        console.log('accounts', accounts);
        
        
        
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        
        connectionStatus.classList.remove('loading');
        await updateConnectionStatus();
        connectButton.style.display = 'none';
        disconnectButton.style.display = 'inline-block';
        
        contractInfo.style.display = 'block';
        await loadContractData();
        
        // Update button states based on user roles
        await updateButtonStates();
        
        // Listen for account changes
        window.ethereum.on('accountsChanged', async (accounts) => {
            if (accounts.length === 0) {
                // User disconnected
                disconnectWallet();
            } else {
                // User switched accounts - update to new account
                console.log('Account changed to:', accounts[0]);
                try {
                    const signer = provider.getSigner();
                    const newAddress = await signer.getAddress();
                    currentUserAddress = newAddress; // Update current user address
                    connectionStatus.classList.remove('loading');
                    await updateConnectionStatus();
                    
                    // Reload contract data for new account
                    await loadContractData();
                    
                    // Update button states for new account
                    await updateButtonStates();
                } catch (error) {
                    console.error('Error handling account change:', error);
                    // If we can't get the new account, disconnect
                    disconnectWallet();
                }
            }
        });
        
        // Listen for network changes
        window.ethereum.on('chainChanged', () => {
            location.reload();
        });
        
    } catch (error) {
        console.error('Connection error:', error);
        if (error.message.includes('ethers.js')) {
            showError('Failed to load required libraries. Please refresh the page.');
        } else if (error.code === 4001) {
            showError('Connection rejected by user.');
        } else if (error.code === -32002) {
            showError('Connection request already pending. Please check MetaMask.');
        } else {
            showError('Failed to connect wallet: ' + error.message);
        }
    }
}

// Disconnect wallet function
function disconnectWallet() {
    // Reset UI state
    provider = null;
    contract = null;
    currentUserAddress = null; // Clear current user address
    
    // Reset event data
    lastQueriedBlock = 0;
    allScheduledEvents = [];
    allExecutedEvents = [];
    allCancelledEvents = [];
    allSaltEvents = [];
    lastEventsHash = null;
    lastOperationStatesHash = null;
    
    // Reset role permissions
    window.userIsCanceller = false;
    window.userIsExecutor = false;
    window.userIsRecoveryTriggerer = false;
    window.userIsRecoverer = false;
    window.isInRecoveryMode = false;
    
    // Stop auto-refresh
    stopAutoRefresh();
    
    // Stop balance refresh
    stopBalanceRefresh();
    
    // Hide pending indicator
    const pendingIndicator = document.getElementById('pendingIndicator');
    if (pendingIndicator) {
        pendingIndicator.style.display = 'none';
    }
    
    connectionStatus.classList.remove('loading');
    connectionStatus.textContent = 'Wallet detected - Click to connect';
    connectButton.style.display = 'inline-block';
    connectButton.textContent = 'Connect Wallet';
    connectButton.disabled = false;
    disconnectButton.style.display = 'none';
    contractInfo.style.display = 'none';
    
    // Remove event listeners to prevent memory leaks
    if (window.ethereum && window.ethereum.removeAllListeners) {
        window.ethereum.removeAllListeners('accountsChanged');
        window.ethereum.removeAllListeners('chainChanged');
    }
    
    console.log('Wallet disconnected');
}

// Connect wallet event listener
connectButton.addEventListener('click', connectWallet);

// Disconnect wallet event listener
disconnectButton.addEventListener('click', disconnectWallet);

// Propose transaction event listener
proposeButton.addEventListener('click', proposeTransaction);

// Refresh operations event listener
refreshOperationsButton.addEventListener('click', loadScheduledOperations);

// Tab switching event listeners
rawTransactionTab.addEventListener('click', () => switchTab('raw'));
tokenTransferTab.addEventListener('click', () => switchTab('token'));

// Token transfer event listeners
tokenAddress.addEventListener('input', handleTokenAddressChange);
tokenSelect.addEventListener('change', handleTokenSelectChange);
proposeTokenTransferButton.addEventListener('click', proposeTokenTransfer);

// Token transfer event listeners
tokenAddress.addEventListener('input', handleTokenAddressChange);
tokenSelect.addEventListener('change', handleTokenSelectChange);
proposeTokenTransferButton.addEventListener('click', proposeTokenTransfer);

// Recovery trigger event listener
recoveryTriggerButton.addEventListener('click', triggerRecovery);

// Add token event listener
const addTokenButton = document.getElementById('addTokenButton');
const newTokenAddressInput = document.getElementById('newTokenAddress');
addTokenButton.addEventListener('click', addNewToken);
newTokenAddressInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addNewToken();
    }
});

// Recovery mode action event listeners
document.addEventListener('DOMContentLoaded', () => {
    const exitRecoveryButton = document.getElementById('exitRecoveryMode');
    const cancelAllButton = document.getElementById('cancelAllOperations');
    
    if (exitRecoveryButton) {
        exitRecoveryButton.addEventListener('click', exitRecoveryMode);
    }
    
    if (cancelAllButton) {
        cancelAllButton.addEventListener('click', cancelAllOperations);
    }
});

// Tab switching functionality
function switchTab(tabType) {
    if (tabType === 'raw') {
        rawTransactionTab.classList.add('active');
        tokenTransferTab.classList.remove('active');
        rawTransactionPanel.classList.add('active');
        tokenTransferPanel.classList.remove('active');
    } else if (tabType === 'token') {
        rawTransactionTab.classList.remove('active');
        tokenTransferTab.classList.add('active');
        rawTransactionPanel.classList.remove('active');
        tokenTransferPanel.classList.add('active');
    }
}

// Main tab switching functionality
function switchMainTab(tabType) {
    console.log('Switching to tab:', tabType);
    
    try {
        // Don't switch to create transaction if it's disabled (recovery mode)
        if (tabType === 'createTransaction') {
            const createTransactionTab = document.getElementById('createTransactionTab');
            if (createTransactionTab && createTransactionTab.classList.contains('disabled')) {
                console.log('Create transaction tab is disabled, not switching');
                return; // Don't switch
            }
        }
        
        // Remove active class from all tabs and sections
        const toolbarTabs = document.querySelectorAll('.toolbar-tab');
        const mainSections = document.querySelectorAll('.main-section');
        
        console.log('Found toolbar tabs:', toolbarTabs.length);
        console.log('Found main sections:', mainSections.length);
        
        toolbarTabs.forEach(tab => tab.classList.remove('active'));
        mainSections.forEach(section => section.classList.remove('active'));
        
        // Add active class to selected tab and section
        let targetTab, targetSection;
        
        if (tabType === 'dashboard') {
            targetTab = document.getElementById('dashboardTab');
            targetSection = document.getElementById('dashboardSection');
        } else if (tabType === 'createTransaction') {
            targetTab = document.getElementById('createTransactionTab');
            targetSection = document.getElementById('createTransactionSection');
        } else if (tabType === 'operations') {
            targetTab = document.getElementById('operationsTab');
            targetSection = document.getElementById('operationsSection');
        } else if (tabType === 'recoveryPanel') {
            targetTab = document.getElementById('recoveryPanelTab');
            targetSection = document.getElementById('recoveryPanelSection');
        }
        
        console.log('Target elements found:', !!targetTab, !!targetSection);
        
        if (targetTab && targetSection) {
            targetTab.classList.add('active');
            targetSection.classList.add('active');
            console.log('Successfully switched to', tabType);
        } else {
            console.error('Could not find target elements for', tabType);
        }
        
    } catch (error) {
        console.error('Error in switchMainTab:', error);
    }
}

// Make function available globally
window.switchMainTab = switchMainTab;

// Initialize token list
function initializeTokenList() {
    tokenSelect.innerHTML = '<option value="">Select a token...</option>';
    SUPPORTED_TOKENS.forEach(token => {
        const option = document.createElement('option');
        option.value = token.address;
        option.textContent = `${token.name} (${token.address.slice(0, 6)}...${token.address.slice(-4)})`;
        tokenSelect.appendChild(option);
    });
}

// Token address handling
async function handleTokenAddressChange() {
    const address = tokenAddress.value.trim();
    
    // Clear previous state
    tokenInfo.style.display = 'none';
    tokenError.style.display = 'none';
    tokenAmountHelp.style.display = 'none';
    
    // Disable other fields if no address
    if (!address) {
        disableTokenFields();
        return;
    }
    
    // Validate address format
    if (!ethers.utils.isAddress(address)) {
        showTokenError('Invalid token address format');
        disableTokenFields();
        return;
    }
    
    // Query token contract for decimals
    try {
        await validateAndLoadToken(address);
    } catch (error) {
        console.error('Error validating token:', error);
        showTokenError('Failed to load token information. Make sure this is a valid ERC20 token address.');
        disableTokenFields();
    }
}

// Token select handling
function handleTokenSelectChange() {
    const selectedAddress = tokenSelect.value;
    if (selectedAddress) {
        tokenAddress.value = selectedAddress;
        handleTokenAddressChange();
    }
}

// Validate and load token information
async function validateAndLoadToken(address) {
    if (!provider) {
        throw new Error('Provider not connected');
    }
    
    // Create a simple ERC20 contract interface to get decimals and symbol
    const erc20Abi = [
        "function decimals() view returns (uint8)",
        "function symbol() view returns (string)",
        "function name() view returns (string)"
    ];
    
    const tokenContract = new ethers.Contract(address, erc20Abi, provider);
    
    // Get token information
    const decimals = await tokenContract.decimals();
    let symbol = '';
    let name = '';
    
    try {
        symbol = await tokenContract.symbol();
        name = await tokenContract.name();
    } catch (error) {
        // Some tokens might not have symbol/name, that's ok
        console.log('Could not get token symbol/name:', error);
    }
    
    // Store token info for later use
    tokenAddress.dataset.decimals = decimals.toString();
    tokenAddress.dataset.symbol = symbol;
    tokenAddress.dataset.name = name;
    
    // Show token info
    const displayName = name || symbol || 'Unknown Token';
    const displaySymbol = symbol || 'TOKEN';
    tokenInfo.textContent = `Token: ${displayName} (${displaySymbol}) - ${decimals} decimals`;
    tokenInfo.style.display = 'block';
    
    // Show amount help
    tokenAmountHelp.textContent = `Enter amount in ${displaySymbol} (human readable format)`;
    tokenAmountHelp.style.display = 'block';
    
    // Enable other fields
    enableTokenFields();
}

// Enable token form fields
function enableTokenFields() {
    tokenTo.disabled = false;
    tokenAmount.disabled = false;
    proposeTokenTransferButton.disabled = false;
}

// Disable token form fields
function disableTokenFields() {
    tokenTo.disabled = true;
    tokenAmount.disabled = true;
    proposeTokenTransferButton.disabled = true;
    tokenTo.value = '';
    tokenAmount.value = '';
}

// Show token error
function showTokenError(message) {
    tokenError.textContent = message;
    tokenError.style.display = 'block';
}

// Add new token functionality
function showAddTokenStatus(message, type) {
    const statusElement = document.getElementById('addTokenStatus');
    statusElement.textContent = message;
    statusElement.className = `add-token-status ${type}`;
    
    // Scroll the status message into view if it's not visible
    setTimeout(() => {
        statusElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'nearest',
            inline: 'nearest'
        });
    }, 100);
}

function hideAddTokenStatus() {
    const statusElement = document.getElementById('addTokenStatus');
    statusElement.style.display = 'none';
}

async function validateTokenContract(address) {
    try {
        const tokenContract = new ethers.Contract(address, ERC20_ABI, provider);
        
        // Try to get basic token info
        const [name, symbol, decimals] = await Promise.all([
            tokenContract.name(),
            tokenContract.symbol(), 
            tokenContract.decimals()
        ]);
        
        // Validate the results make sense
        if (typeof decimals !== 'number' || decimals < 0 || decimals > 77) {
            throw new Error('Invalid token decimals');
        }
        
        if (!symbol || symbol.trim() === '') {
            throw new Error('Token has no symbol');
        }
        
        return { name, symbol, decimals, address };
    } catch (error) {
        console.error('Token validation error:', error);
        
        // Provide more specific error messages
        if (error.message.includes('CALL_EXCEPTION')) {
            throw new Error('This address is not a valid ERC20 token contract');
        } else if (error.message.includes('invalid address')) {
            throw new Error('Invalid contract address');
        } else if (error.message.includes('network error')) {
            throw new Error('Network error - please try again');
        } else if (error.message.includes('Invalid token decimals')) {
            throw new Error('Token has invalid decimal configuration');
        } else if (error.message.includes('Token has no symbol')) {
            throw new Error('Token missing required symbol');
        } else if (error.code === 'NETWORK_ERROR') {
            throw new Error('Network connection failed - please check your connection');
        } else if (error.code === -32000) {
            throw new Error('Contract execution failed - this may not be a valid token');
        } else {
            throw new Error('Failed to validate token contract - ensure this is a valid ERC20 token address');
        }
    }
}

async function addNewToken() {
    if (!provider) {
        showAddTokenStatus('Please connect your wallet first', 'error');
        return;
    }

    const addressInput = document.getElementById('newTokenAddress');
    const address = addressInput.value.trim();
    
    if (!address) {
        showAddTokenStatus('Please enter a token address', 'error');
        return;
    }
    
    if (!ethers.utils.isAddress(address)) {
        showAddTokenStatus('Invalid address format', 'error');
        return;
    }
    
    // Check if token already exists
    const existingToken = SUPPORTED_TOKENS.find(token => 
        token.address.toLowerCase() === address.toLowerCase()
    );
    
    if (existingToken) {
        showAddTokenStatus(`${existingToken.symbol} (${existingToken.name}) is already in the list`, 'error');
        return;
    }
    
    try {
        const addButton = document.getElementById('addTokenButton');
        addButton.disabled = true;
        addButton.textContent = 'Validating...';
        
        showAddTokenStatus('Validating token contract...', 'loading');
        
        const tokenInfo = await validateTokenContract(address);
        
        // Add to SUPPORTED_TOKENS array
        SUPPORTED_TOKENS.push({
            name: tokenInfo.name,
            symbol: tokenInfo.symbol,
            address: tokenInfo.address,
            decimals: tokenInfo.decimals
        });
        
        showAddTokenStatus(`✅ Added ${tokenInfo.symbol} (${tokenInfo.name}) successfully!`, 'success');
        
        // Clear input
        addressInput.value = '';
        
        // Refresh token balances to show the new token
        await loadTokenBalances();
        
        // Refresh token dropdown for token transfers
        initializeTokenList();
        
        // Auto-hide success message after 3 seconds
        setTimeout(() => {
            hideAddTokenStatus();
        }, 3000);
        
    } catch (error) {
        console.error('Error adding token:', error);
        showAddTokenStatus(error.message || 'Failed to add token', 'error');
    } finally {
        const addButton = document.getElementById('addTokenButton');
        addButton.disabled = false;
        addButton.textContent = '+ Add Token';
    }
}

// Remove token functionality
function removeToken(tokenIndex) {
    if (tokenIndex < 3) {
        showAddTokenStatus('Cannot remove built-in tokens', 'error');
        return;
    }
    
    const token = SUPPORTED_TOKENS[tokenIndex];
    if (!token) return;
    
    const confirmed = confirm(`Remove ${token.symbol} (${token.name}) from the token list?`);
    if (!confirmed) return;
    
    // Remove from array
    SUPPORTED_TOKENS.splice(tokenIndex, 1);
    
    showAddTokenStatus(`Removed ${token.symbol} from the list`, 'success');
    
    // Refresh token balances
    loadTokenBalances();
    
    // Refresh token dropdown
    initializeTokenList();
    
    // Auto-hide message
    setTimeout(() => {
        hideAddTokenStatus();
    }, 2000);
}

// Token transfer proposal
async function proposeTokenTransfer() {
    if (!contract || !provider) {
        showError('Please connect your wallet first.');
        return;
    }

    try {
        // Get form values
        const tokenAddr = tokenAddress.value.trim();
        const toAddress = tokenTo.value.trim();
        const amount = tokenAmount.value.trim();
        const saltInput = tokenSalt.value.trim();
        const delayInput = tokenDelay.value.trim();

        // Validate required fields
        if (!tokenAddr) {
            showError('Token address is required.');
            return;
        }

        if (!ethers.utils.isAddress(tokenAddr)) {
            showError('Invalid token address.');
            return;
        }

        if (!toAddress) {
            showError('To address is required.');
            return;
        }

        if (!ethers.utils.isAddress(toAddress)) {
            showError('Invalid to address.');
            return;
        }

        if (!amount || parseFloat(amount) <= 0) {
            showError('Amount must be greater than 0.');
            return;
        }

        // Get token decimals
        const decimals = parseInt(tokenAddress.dataset.decimals || '18');
        const symbol = tokenAddress.dataset.symbol || 'TOKEN';

        // Convert amount to raw units (like wei for ETH)
        const rawAmount = ethers.utils.parseUnits(amount, decimals);

        // Create ERC20 transfer call data
        const transferCalldata = ethers.utils.id('transfer(address,uint256)').slice(0, 10) +
            ethers.utils.defaultAbiCoder.encode(['address', 'uint256'], [toAddress, rawAmount]).slice(2);

        // Set up transaction parameters
        const valueWei = ethers.BigNumber.from(0); // No ETH value for token transfer
        const predecessor = ethers.constants.HashZero;
        
        // Generate salt if not provided
        let salt;
        if (saltInput) {
            salt = ethers.utils.formatBytes32String(saltInput);
        } else {
            const randomBytes = ethers.utils.randomBytes(32);
            salt = ethers.utils.hexlify(randomBytes);
        }

        // Get delay
        let delay;
        if (delayInput) {
            delay = parseInt(delayInput);
        } else {
            const minDelay = await contract.getMinDelay();
            delay = minDelay.toNumber();
        }

        showProposalStatus('Preparing token transfer...', 'pending');
        proposeTokenTransferButton.disabled = true;

        // Get the signer for the transaction
        const signer = provider.getSigner();
        const contractWithSigner = contract.connect(signer);

        // Generate operation hash for reference
        const operationHash = await contract.hashOperation(
            tokenAddr,
            valueWei,
            transferCalldata,
            predecessor,
            salt
        );

        showProposalStatus('Submitting token transfer to blockchain...', 'pending');

        // Call the schedule function
        const tx = await contractWithSigner.schedule(
            tokenAddr,
            valueWei,
            transferCalldata,
            predecessor,
            salt,
            delay
        );

        showProposalStatus('Token transfer submitted! Waiting for confirmation...', 'pending');

        // Wait for transaction to be mined
        const receipt = await tx.wait();

        showProposalStatus(
            `Token transfer proposed successfully!
            Transaction Hash: ${receipt.transactionHash}
            Operation Hash: ${operationHash}
            Transfer: ${amount} ${symbol} to ${toAddress}
            Ready for execution after delay period.`, 
            'success'
        );

        // Clear form
        tokenAddress.value = '';
        tokenTo.value = '';
        tokenAmount.value = '';
        tokenSalt.value = '';
        tokenDelay.value = '';
        disableTokenFields();
        tokenInfo.style.display = 'none';
        tokenAmountHelp.style.display = 'none';

        // Automatically refresh operations after successful proposal
        setTimeout(() => {
            loadScheduledOperations();
        }, 1000);

        // Auto-switch to operations tab after successful transaction
        setTimeout(() => {
            switchMainTab('operations');
        }, 1500);

        console.log('Token transfer proposal successful:', {
            txHash: receipt.transactionHash,
            operationHash: operationHash,
            token: tokenAddr,
            to: toAddress,
            amount: amount,
            rawAmount: rawAmount.toString(),
            salt: salt,
            delay: delay
        });

    } catch (error) {
        console.error('Error proposing token transfer:', error);
        
        let errorMsg = 'Failed to propose token transfer: ';
        if (error.code === 4001) {
            errorMsg += 'Transaction rejected by user.';
        } else if (error.message.includes('AccessControl')) {
            errorMsg += 'You do not have the PROPOSER_ROLE required to propose transactions.';
        } else if (error.message.includes('TimelockController: insufficient delay')) {
            errorMsg += 'The specified delay is less than the minimum required delay.';
        } else {
            errorMsg += error.message;
        }
        
        showProposalStatus(errorMsg, 'error');
    } finally {
        proposeTokenTransferButton.disabled = false;
    }
}

// Recovery mode UI management
async function handleRecoveryModeUI(isRecoveryMode) {
    // Track recovery mode status globally
    window.isInRecoveryMode = isRecoveryMode;
    
    const createTransactionTab = document.getElementById('createTransactionTab');
    const recoveryPanelTab = document.getElementById('recoveryPanelTab');
    const recoveryTriggerSection = document.querySelector('.recovery-trigger-section');
    const roleAssignmentsSection = document.getElementById('roleAssignmentsSection');
    const infoSectionsContainer = document.querySelector('.info-sections-container');
    
    if (isRecoveryMode) {
        // Show Recovery Panel tab
        recoveryPanelTab.style.display = 'flex';
        
        // Disable create transaction tab
        createTransactionTab.classList.add('disabled');
        createTransactionTab.title = 'Transaction creation is disabled during recovery mode';
        
        // Hide recovery trigger button
        if (recoveryTriggerSection) {
            recoveryTriggerSection.style.display = 'none';
        }
        
        // Hide role assignments section in dashboard
        if (roleAssignmentsSection) {
            roleAssignmentsSection.style.display = 'none';
        }
        
        // Center the remaining two info sections in dashboard
        if (infoSectionsContainer) {
            infoSectionsContainer.classList.add('recovery-mode');
        }
        
        // Switch to Recovery Panel as default, or if currently on create transaction tab
        const createTransactionSection = document.getElementById('createTransactionSection');
        const currentActiveSection = document.querySelector('.main-section.active');
        
        if (!currentActiveSection || 
            createTransactionSection.classList.contains('active') ||
            currentActiveSection.id === 'dashboardSection') {
            switchMainTab('recoveryPanel');
        }
        
        // Load recovery mode role management
        await loadRecoveryRoleManagement();
        
        // Update recovery mode button states
        await updateRecoveryModeButtons();
    } else {
        // Hide Recovery Panel tab
        recoveryPanelTab.style.display = 'none';
        
        // Enable create transaction tab
        createTransactionTab.classList.remove('disabled');
        createTransactionTab.title = '';
        
        // Show recovery trigger button
        if (recoveryTriggerSection) {
            recoveryTriggerSection.style.display = 'flex';
        }
        
        // Show role assignments section in dashboard
        if (roleAssignmentsSection) {
            roleAssignmentsSection.style.display = 'block';
        }
        
        // Restore three-column layout in dashboard
        if (infoSectionsContainer) {
            infoSectionsContainer.classList.remove('recovery-mode');
        }
        
        // Switch to dashboard if currently on recovery panel
        const recoveryPanelSection = document.getElementById('recoveryPanelSection');
        if (recoveryPanelSection && recoveryPanelSection.classList.contains('active')) {
            switchMainTab('dashboard');
        }
    }
}

// Check if user is a recoverer
async function checkRecovererPermission() {
    if (!contract || !currentUserAddress) {
        return false;
    }
    
    try {
        const recovererRoleHash = await contract.RECOVERER_ROLE();
        const hasRecovererRole = await contract.hasRole(recovererRoleHash, currentUserAddress);
        console.log(`User ${formatAddress(currentUserAddress)} has recoverer role: ${hasRecovererRole}`);
        
        return hasRecovererRole;
    } catch (error) {
        console.error('Error checking recoverer permission:', error);
        return false;
    }
}

// Update recovery mode button states
async function updateRecoveryModeButtons() {
    const isRecoverer = await checkRecovererPermission();
    const exitRecoveryButton = document.getElementById('exitRecoveryMode');
    const cancelAllButton = document.getElementById('cancelAllOperations');
    
    [exitRecoveryButton, cancelAllButton].forEach(button => {
        if (button) {
            if (!isRecoverer) {
                button.disabled = true;
                button.title = 'Only recoverers can perform this action';
            } else {
                button.disabled = false;
                button.title = '';
            }
        }
    });
}

// Load recovery role management UI
async function loadRecoveryRoleManagement() {
    const recoveryRolesContainer = document.getElementById('recoveryRolesList');
    const isRecoverer = await checkRecovererPermission();
    
    const roles = [
        { name: 'Proposers', roleFunction: 'PROPOSER_ROLE' },
        { name: 'Executors', roleFunction: 'EXECUTOR_ROLE' },
        { name: 'Cancellers', roleFunction: 'CANCELLER_ROLE' },
        { name: 'Recovery Triggerers', roleFunction: 'RECOVERY_TRIGGER_ROLE' },
        { name: 'Recoverers', roleFunction: 'RECOVERER_ROLE' }
    ];
    
    recoveryRolesContainer.innerHTML = '';
    
    for (const roleInfo of roles) {
        try {
            const roleHash = await contract[roleInfo.roleFunction]();
            const members = await getRoleMembersFromEvents(roleHash);
            
            const roleGroupDiv = document.createElement('div');
            roleGroupDiv.className = 'recovery-role-group';
            
            roleGroupDiv.innerHTML = `
                <div class="recovery-role-title">
                    ${roleInfo.name}
                    <button class="grant-role-button" onclick="showGrantRoleForm('${roleInfo.roleFunction}', '${roleInfo.name}')" 
                            ${!isRecoverer ? 'disabled title="Only recoverers can grant roles"' : ''}>
                        + Grant Role
                    </button>
                </div>
                <div class="recovery-role-members" id="recovery-${roleInfo.roleFunction}-members">
                    ${members.length === 0 ? 
                        '<div style="color: #64748b; font-style: italic;">No members</div>' : 
                        members.map(member => `
                            <div class="recovery-role-member">
                                <span class="recovery-member-address">${member}</span>
                                <button class="revoke-role-button" onclick="revokeRoleFromMember('${roleInfo.roleFunction}', '${member}')"
                                        ${!isRecoverer ? 'disabled title="Only recoverers can revoke roles"' : ''}>
                                    Revoke
                                </button>
                            </div>
                        `).join('')
                    }
                </div>
                <div class="grant-role-form" id="grant-${roleInfo.roleFunction}-form" style="display: none;">
                    <input type="text" class="grant-role-input" id="grant-${roleInfo.roleFunction}-address" 
                           placeholder="0x... address to grant ${roleInfo.name} role">
                    <button class="grant-role-button" onclick="grantRoleToAddress('${roleInfo.roleFunction}', '${roleInfo.name}')">
                        Grant
                    </button>
                    <button class="revoke-role-button" onclick="hideGrantRoleForm('${roleInfo.roleFunction}')">
                        Cancel
                    </button>
                </div>
            `;
            
            recoveryRolesContainer.appendChild(roleGroupDiv);
        } catch (error) {
            console.error(`Failed to load recovery role ${roleInfo.name}:`, error);
        }
    }
}

async function loadContractData() {
    
    try {
        // Load contract basic info
        document.getElementById('contractAddress').textContent = CONTRACT_ADDRESS;

        const minDelay = await contract.getMinDelay();
        
        document.getElementById('minDelay').textContent = `${minDelay} seconds (${Math.round(minDelay / 3600)} hours)`;
            
        const recoveryMode = await contract.recoveryMode();
        document.getElementById('recoveryMode').textContent = recoveryMode ? 'Active' : 'Inactive';
            
        const recoveryEpoch = await contract.currentRecoveryEpoch();
        document.getElementById('recoveryEpoch').textContent = recoveryEpoch.toString();
        
        // Handle recovery mode UI switching
        await handleRecoveryModeUI(recoveryMode);
        
        // Load contract balance
        await loadContractBalance();
        
        // Start auto-refresh for contract balance
        startBalanceRefresh();
        
        // Load role assignments
        await loadRoleMembers();
        
        // Ensure button states are updated before loading operations
        await updateButtonStates();
        
        // Load scheduled operations
        await loadScheduledOperations();
        
    } catch (error) {
        showError('Failed to load contract data: ' + error.message);
    }
}

async function loadContractBalance() {
    try {
        // Load ETH balance
        const balance = await provider.getBalance(CONTRACT_ADDRESS);
        const balanceEth = ethers.utils.formatEther(balance);
        document.getElementById('contractBalance').textContent = `${balanceEth} ETH`;
        
        // Load token balances
        await loadTokenBalances();
    } catch (error) {
        console.error('Failed to load contract balance:', error);
        document.getElementById('contractBalance').textContent = 'Error loading balance';
    }
}

async function loadTokenBalances() {
    try {
        const tokenBalancesElement = document.getElementById('tokenBalances');
        
        if (SUPPORTED_TOKENS.length === 0) {
            tokenBalancesElement.textContent = 'No tokens configured';
            return;
        }
        
        const balancePromises = SUPPORTED_TOKENS.map(async (token, index) => {
            try {
                const tokenContract = new ethers.Contract(token.address, ERC20_ABI, provider);
                const balance = await tokenContract.balanceOf(CONTRACT_ADDRESS);
                const formattedBalance = ethers.utils.formatUnits(balance, token.decimals);
                
                // Format the balance to avoid showing too many decimal places
                const displayBalance = parseFloat(formattedBalance).toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: token.decimals > 6 ? 6 : token.decimals
                });
                
                return {
                    index,
                    symbol: token.symbol,
                    name: token.name,
                    address: token.address,
                    balance: displayBalance,
                    hasBalance: !balance.isZero(),
                    isDynamic: index >= 3 // First 3 are hardcoded tokens
                };
            } catch (error) {
                console.error(`Error loading balance for ${token.symbol}:`, error);
                return {
                    index,
                    symbol: token.symbol,
                    name: token.name,
                    address: token.address,
                    balance: 'Error',
                    hasBalance: false,
                    isDynamic: index >= 3
                };
            }
        });
        
        const balances = await Promise.all(balancePromises);
        
        // Create the display elements
        if (balances.length === 0) {
            tokenBalancesElement.textContent = 'No tokens';
        } else {
            // Create individual token balance elements with remove option for dynamic tokens
            const tokenElements = balances.map(tokenData => {
                const removeButton = tokenData.isDynamic ? 
                    ` <button class="remove-token-button" onclick="removeToken(${tokenData.index})" title="Remove ${tokenData.symbol}">×</button>` : 
                    '';
                
                return `<div class="token-balance-item" title="${tokenData.name} (${tokenData.address})">
                    <span class="token-balance">${tokenData.balance} ${tokenData.symbol}</span>${removeButton}
                </div>`;
            });
            
            tokenBalancesElement.innerHTML = tokenElements.join('');
        }
        
    } catch (error) {
        console.error('Failed to load token balances:', error);
        document.getElementById('tokenBalances').textContent = 'Error loading token balances';
    }
}

async function loadRoleMembers() {
    const roles = [
        { name: 'proposers', roleFunction: 'PROPOSER_ROLE', listId: 'proposersList', loadingId: 'proposersLoading' },
        { name: 'executors', roleFunction: 'EXECUTOR_ROLE', listId: 'executorsList', loadingId: 'executorsLoading' },
        { name: 'cancellers', roleFunction: 'CANCELLER_ROLE', listId: 'cancellersList', loadingId: 'cancellersLoading' },
        { name: 'recoveryTriggerers', roleFunction: 'RECOVERY_TRIGGER_ROLE', listId: 'recoveryTriggerersList', loadingId: 'recoveryTriggerersLoading' },
        { name: 'recoverers', roleFunction: 'RECOVERER_ROLE', listId: 'recoverersList', loadingId: 'recoverersLoading' }
    ];

    for (const roleInfo of roles) {
        try {
            const roleHash = await contract[roleInfo.roleFunction]();
            const members = await getRoleMembersFromEvents(roleHash);
            
            displayRoleMembers(roleInfo.listId, roleInfo.loadingId, members, roleInfo.name);
        } catch (error) {
            console.error(`Failed to load ${roleInfo.name}:`, error);
            document.getElementById(roleInfo.loadingId).textContent = 'Error loading';
        }
    }
}

async function getRoleMembersFromEvents(roleHash) {
    try {
        // Get all RoleGranted events for this role
        const grantedFilter = contract.filters.RoleGranted(roleHash, null, null);
        const grantedEvents = await contract.queryFilter(grantedFilter, 0, 'latest');
        
        // Get all RoleRevoked events for this role  
        const revokedFilter = contract.filters.RoleRevoked(roleHash, null, null);
        const revokedEvents = await contract.queryFilter(revokedFilter, 0, 'latest');
        
        // Build a map of current role holders
        const roleMembers = new Set();
        
        // Add all granted addresses
        for (const event of grantedEvents) {
            roleMembers.add(event.args.account);
        }
        
        // Remove all revoked addresses
        for (const event of revokedEvents) {
            roleMembers.delete(event.args.account);
        }
        
        // Convert Set to Array and verify current status
        const currentMembers = [];
        for (const member of roleMembers) {
            // Double-check current status in case we missed any events
            if (await contract.hasRole(roleHash, member)) {
                currentMembers.push(member);
            }
        }
        
        return currentMembers;
    } catch (error) {
        console.error('Error fetching role members from events:', error);
        return [];
    }
}

function displayRoleMembers(listId, loadingId, members, roleName) {
    const loadingElement = document.getElementById(loadingId);
    const listElement = document.getElementById(listId);
    
    loadingElement.style.display = 'none';
    listElement.style.display = 'block';
    listElement.innerHTML = '';
    
    // Special case for executors with zero address
    if (roleName === 'executors' && members.length === 1 && members[0] === '0x0000000000000000000000000000000000000000') {
        const li = document.createElement('li');
        li.className = 'address-item';
        li.innerHTML = `
            <div style="background-color: #e8f5e8; border-left: 4px solid #28a745; padding: 10px; border-radius: 4px; margin: 5px 0;">
                <div style="font-weight: bold; color: #155724; margin-bottom: 5px;">
                    🔓 Open Execution
                </div>
                <div style="color: #155724; font-size: 0.9em; line-height: 1.4;">
                    The zero address (${members[0]}) is the only executor, which means <strong>anyone can execute</strong> ready operations.
                </div>
            </div>
        `;
        listElement.appendChild(li);
    } else if (members.length === 0) {
        const li = document.createElement('li');
        li.className = 'address-item';
        li.textContent = 'No members (anyone can perform this role)';
        li.style.fontStyle = 'italic';
        li.style.color = '#6c757d';
        listElement.appendChild(li);
    } else {
        members.forEach(member => {
            const li = document.createElement('li');
            li.className = 'address-item';
            li.textContent = member;
            listElement.appendChild(li);
        });
    }
}

function showError(message) {
    errorMessage.textContent = message;
    errorSection.style.display = 'block';
    setTimeout(() => {
        errorSection.style.display = 'none';
    }, 5000);
}

function showProposalStatus(message, type) {
    proposalStatus.textContent = message;
    proposalStatus.className = `proposal-status ${type}`;
    proposalStatus.style.display = 'block';
    
    if (type === 'success' || type === 'error') {
        setTimeout(() => {
            proposalStatus.style.display = 'none';
        }, 8000);
    }
}

async function loadScheduledOperations() {
    if (!contract) {
        return;
    }

    try {
        // Disable refresh button while loading
        refreshOperationsButton.disabled = true;

        // Get current block number
        const currentBlock = await provider.getBlockNumber();
        
        // Determine the starting block for queries
        const fromBlock = lastQueriedBlock === 0 ? 0 : lastQueriedBlock + 1;
        
        console.log(`Querying events from block ${fromBlock} to ${currentBlock} (last queried: ${lastQueriedBlock})`);

        // Only query new events since last update
        if (fromBlock <= currentBlock) {
            // Get new CallScheduled events
            const scheduledFilter = contract.filters.CallScheduled();
            const newScheduledEvents = await contract.queryFilter(scheduledFilter, fromBlock, currentBlock);
            allScheduledEvents.push(...newScheduledEvents);

            // Get new CallExecuted events
            const executedFilter = contract.filters.CallExecuted();
            const newExecutedEvents = await contract.queryFilter(executedFilter, fromBlock, currentBlock);
            allExecutedEvents.push(...newExecutedEvents);

            // Get new Cancelled events
            const cancelledFilter = contract.filters.Cancelled();
            const newCancelledEvents = await contract.queryFilter(cancelledFilter, fromBlock, currentBlock);
            allCancelledEvents.push(...newCancelledEvents);

            // Get new CallSalt events
            const saltFilter = contract.filters.CallSalt();
            const newSaltEvents = await contract.queryFilter(saltFilter, fromBlock, currentBlock);
            allSaltEvents.push(...newSaltEvents);
            
            console.log(`Found new events: ${newScheduledEvents.length} scheduled, ${newExecutedEvents.length} executed, ${newCancelledEvents.length} cancelled, ${newSaltEvents.length} salt`);
        }

        // Update last queried block
        lastQueriedBlock = currentBlock;

        // Create maps for quick lookup using all accumulated events
        const executedIds = new Set(allExecutedEvents.map(event => event.args.id));
        const cancelledIds = new Set(allCancelledEvents.map(event => event.args.id));
        const saltMap = new Map();
        
        // Build salt map from all accumulated CallSalt events
        for (const event of allSaltEvents) {
            saltMap.set(event.args.id, event.args.salt);
        }

        console.log('Total CallSalt events:', allSaltEvents.length);
        console.log('Salt map size:', saltMap.size);

        // Group all accumulated scheduled events by operation ID
        const operationsMap = new Map();
        
        for (const event of allScheduledEvents) {
            const { id, index, target, value, data, predecessor, delay } = event.args;
            
            if (!operationsMap.has(id)) {
                operationsMap.set(id, {
                    id,
                    calls: [],
                    blockNumber: event.blockNumber,
                    transactionHash: event.transactionHash,
                    predecessor,
                    delay: delay.toNumber(),
                    salt: null // We'll get this from CallSalt events or use zero hash
                });
            }
            
            operationsMap.get(id).calls.push({
                index: index.toNumber(),
                target,
                value: value.toString(),
                data
            });
        }

        // Set the correct salt for each operation
        for (const [operationId, operation] of operationsMap) {
            // Check if we have a salt from CallSalt events
            if (saltMap.has(operationId)) {
                operation.salt = saltMap.get(operationId);
                console.log(`Operation ${operationId} has salt from CallSalt event:`, operation.salt);
            } else {
                // If no CallSalt event, the salt was zero (operations with zero salt don't emit CallSalt)
                operation.salt = ethers.constants.HashZero;
                console.log(`Operation ${operationId} using zero hash salt:`, operation.salt);
            }
        }

        // Convert to array and get current status for each operation
        const operations = [];
        for (const [operationId, operation] of operationsMap) {
            let status;
            let statusClass;
            
            if (cancelledIds.has(operationId)) {
                status = 'Cancelled';
                statusClass = 'status-unset';
            } else if (executedIds.has(operationId)) {
                status = 'Executed';
                statusClass = 'status-done';
            } else {
                // Check current state from contract
                try {
                    const state = await contract.getOperationState(operationId);
                    switch (state) {
                        case 0: // Unset
                            status = 'Cancelled';
                            statusClass = 'status-unset';
                            break;
                        case 1: // Waiting
                            status = 'Waiting';
                            statusClass = 'status-waiting';
                            break;
                        case 2: // Ready
                            status = 'Ready';
                            statusClass = 'status-ready';
                            break;
                        case 3: // Done
                            status = 'Executed';
                            statusClass = 'status-done';
                            break;
                        default:
                            status = 'Unknown';
                            statusClass = 'status-unset';
                    }
                } catch (error) {
                    console.error('Error getting operation state:', error);
                    status = 'Unknown';
                    statusClass = 'status-unset';
                }
            }
            
            operations.push({
                ...operation,
                status,
                statusClass
            });
        }

        // Sort by block number (newest first)
        operations.sort((a, b) => b.blockNumber - a.blockNumber);

        // Check if events have changed by comparing hash
        const currentEventsHash = generateEventsHash();
        const eventsChanged = lastEventsHash !== currentEventsHash;
        
        // Also check if operation states have changed (e.g., from Waiting to Ready)
        const operationStatesHash = await generateOperationStatesHash(Array.from(operationsMap.keys()));
        const statesChanged = lastOperationStatesHash !== operationStatesHash;
        
        if (eventsChanged || statesChanged) {
            console.log(`UI update needed - Events changed: ${eventsChanged}, States changed: ${statesChanged}`);
            lastEventsHash = currentEventsHash;
            lastOperationStatesHash = operationStatesHash;
            
            // Show loading state only when rebuilding UI
            operationsLoading.style.display = 'block';
            operationsList.style.display = 'none';
            noOperations.style.display = 'none';
            operationsCount.textContent = 'Loading...';
        } else {
            console.log('No events or state changes detected, skipping UI update...');
            // Still need to re-enable refresh button
            refreshOperationsButton.disabled = false;
            return; // Skip UI rebuild
        }

        // Display operations (only if events changed)
        operationsLoading.style.display = 'none';
        
        // Count pending operations (Waiting or Ready)
        const pendingOperations = operations.filter(op => op.status === 'Waiting' || op.status === 'Ready');
        const pendingCount = pendingOperations.length;
        
        // Update pending indicator in main toolbar
        const pendingIndicator = document.getElementById('pendingIndicator');
        if (pendingIndicator) {
            if (pendingCount > 0) {
                pendingIndicator.style.display = 'inline';
            } else {
                pendingIndicator.style.display = 'none';
            }
        }
        
        // Update operations count display based on pending status
        if (pendingCount > 0) {
            // Show pending operations with emphasis
            operationsCount.textContent = `${pendingCount} pending operation${pendingCount !== 1 ? 's' : ''}`;
            operationsCount.className = 'operations-count pending';
        } else {
            // Show total operations count, subdued style
            operationsCount.textContent = `${operations.length} operation${operations.length !== 1 ? 's' : ''}`;
            operationsCount.className = 'operations-count total';
        }

        if (operations.length === 0) {
            noOperations.style.display = 'block';
            // Stop auto-refresh if no operations
            stopAutoRefresh();
        } else {
            operationsList.innerHTML = '';
            operations.forEach(operation => {
                const operationElement = createOperationElement(operation);
                operationsList.appendChild(operationElement);
            });
            operationsList.style.display = 'block';
            
            // Check if we need auto-refresh for waiting/ready operations
            const needsAutoRefresh = operations.some(op => op.status === 'Waiting' || op.status === 'Ready');
            if (needsAutoRefresh) {
                startAutoRefresh();
            } else {
                stopAutoRefresh();
            }
        }

    } catch (error) {
        console.error('Error loading scheduled operations:', error);
        operationsLoading.style.display = 'none';
        operationsCount.textContent = 'Error loading operations';
        noOperations.textContent = 'Error loading operations: ' + error.message;
        noOperations.style.display = 'block';
    } finally {
        refreshOperationsButton.disabled = false;
    }
}

function createOperationElement(operation) {
    const div = document.createElement('div');
    div.className = 'operation-item';
    
    // Calculate ready time
    const currentTime = Math.floor(Date.now() / 1000);
    const readyTime = currentTime + operation.delay;
    const readyDate = new Date(readyTime * 1000);
    
    // Analyze transaction type for better display
    const transactionInfo = analyzeTransactionType(operation.calls);
    
    // Create different displays based on transaction type
    let operationDetails;
    if (transactionInfo.type === 'eth_transfer') {
        operationDetails = createETHTransferDisplay(transactionInfo, operation);
    } else if (transactionInfo.type === 'token_transfer') {
        operationDetails = createTokenTransferDisplay(transactionInfo, operation);
    } else {
        operationDetails = createGenericTransactionDisplay(operation);
    }
    
    div.innerHTML = `
        <div class="operation-header">
            <div class="operation-info">
                <div class="operation-id">ID: ${operation.id}</div>
                <div class="operation-type">${transactionInfo.displayName}</div>
            </div>
            <div class="operation-status ${operation.statusClass}">${operation.status}</div>
        </div>
        ${operationDetails}
        <div class="operation-actions">
            ${operation.status === 'Ready' ? 
                window.isInRecoveryMode ? 
                    // In recovery mode: NOBODY can execute
                    `<button class="execute-button role-disabled" disabled 
                             title="Operations cannot be executed during recovery mode">
                        Execute (Disabled in Recovery)
                    </button>` :
                    // Normal mode: check executor permissions
                    `<button class="execute-button ${!window.userIsExecutor ? 'role-disabled' : ''}" 
                             onclick="executeOperation('${operation.id}', ${JSON.stringify(operation.calls).replace(/"/g, '&quot;')}, '${operation.predecessor}', '${operation.salt}')"
                             ${!window.userIsExecutor ? 'disabled title="Connect an executor account to execute operations (or check if executors are restricted)"' : ''}>
                        Execute
                    </button>` : 
                ''
            }
            ${(operation.status === 'Waiting' || operation.status === 'Ready') ? 
                // Cancel logic is the same for both normal and recovery mode - use canceller permissions
                `<button class="cancel-button ${!window.userIsCanceller ? 'role-disabled' : ''}" 
                         onclick="cancelOperation('${operation.id}')"
                         ${!window.userIsCanceller ? 'disabled title="Connect a canceller account to cancel operations"' : ''}>
                    Cancel
                </button>` : 
                ''
            }
        </div>
    `;
    
    return div;
}

// Analyze transaction type for better display
function analyzeTransactionType(calls) {
    if (calls.length === 1) {
        const call = calls[0];
        
        // Check for ETH transfer (no data or empty data)
        if (!call.data || call.data === '0x' || call.data === '0x00') {
            const valueEth = ethers.utils.formatEther(call.value);
            return {
                type: 'eth_transfer',
                displayName: '💰 ETH Transfer',
                to: call.target,
                amount: valueEth
            };
        }
        
        // Check for ERC20 token transfer
        if (call.data.length >= 10) {
            const methodSignature = call.data.slice(0, 10);
            const transferSignature = '0xa9059cbb'; // transfer(address,uint256)
            
            if (methodSignature.toLowerCase() === transferSignature.toLowerCase()) {
                try {
                    // Decode the transfer call data
                    const decoded = ethers.utils.defaultAbiCoder.decode(
                        ['address', 'uint256'],
                        '0x' + call.data.slice(10)
                    );
                    
                    const recipient = decoded[0];
                    const amount = decoded[1];
                    
                    // Try to find token info from our supported tokens list
                    const tokenInfo = SUPPORTED_TOKENS.find(token => 
                        token.address.toLowerCase() === call.target.toLowerCase()
                    );
                    
                    let formattedAmount, symbol;
                    if (tokenInfo) {
                        formattedAmount = ethers.utils.formatUnits(amount, tokenInfo.decimals);
                        symbol = tokenInfo.symbol;
                    } else {
                        // Unknown token - show raw amount
                        formattedAmount = amount.toString();
                        symbol = 'TOKENS';
                    }
                    
                    return {
                        type: 'token_transfer',
                        displayName: '🪙 Token Transfer',
                        tokenAddress: call.target,
                        tokenName: tokenInfo ? tokenInfo.name : 'Unknown Token',
                        tokenSymbol: symbol,
                        to: recipient,
                        amount: formattedAmount,
                        rawAmount: amount.toString(),
                        decimals: tokenInfo ? tokenInfo.decimals : null
                    };
                } catch (error) {
                    console.log('Error decoding token transfer data:', error);
                }
            }
        }
    }
    
    // Default: generic transaction
    let displayName = '⚙️ Smart Contract Call';
    if (calls.length > 1) {
        displayName = '📦 Batch Operation';
    }
    
    return {
        type: 'generic',
        displayName: displayName
    };
}

// Create ETH transfer display
function createETHTransferDisplay(transactionInfo, operation) {
    return `
        <div class="operation-details transaction-display eth-transfer">
            <div class="transaction-summary">
                <div class="transaction-icon">💰</div>
                <div class="transaction-info">
                    <div class="transaction-title">Send ${transactionInfo.amount} ETH</div>
                    <div class="transaction-subtitle">to ${formatAddress(transactionInfo.to)}</div>
                </div>
            </div>
            
            <div class="transaction-details">
                <div class="detail-row">
                    <span class="detail-label">Recipient</span>
                    <span class="detail-value address-value">${transactionInfo.to}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Amount</span>
                    <span class="detail-value">${transactionInfo.amount} ETH</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Transaction Hash</span>
                    <span class="detail-value address-value">${operation.transactionHash}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Delay Period</span>
                    <span class="detail-value">${operation.delay} seconds (${Math.round(operation.delay / 3600)} hours)</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Ready Time</span>
                    <span class="detail-value">${new Date((Math.floor(Date.now() / 1000) + operation.delay) * 1000).toLocaleString()}</span>
                </div>
            </div>
        </div>
    `;
}

// Create token transfer display
function createTokenTransferDisplay(transactionInfo, operation) {
    return `
        <div class="operation-details transaction-display token-transfer">
            <div class="transaction-summary">
                <div class="transaction-icon">🪙</div>
                <div class="transaction-info">
                    <div class="transaction-title">Send ${transactionInfo.amount} ${transactionInfo.tokenSymbol}</div>
                    <div class="transaction-subtitle">to ${formatAddress(transactionInfo.to)}</div>
                </div>
            </div>
            
            <div class="transaction-details">
                <div class="detail-row">
                    <span class="detail-label">Token</span>
                    <span class="detail-value">
                        ${transactionInfo.tokenName} (${transactionInfo.tokenSymbol})
                        <span class="address-value">${transactionInfo.tokenAddress}</span>
                    </span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Recipient</span>
                    <span class="detail-value address-value">${transactionInfo.to}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Amount</span>
                    <span class="detail-value">${transactionInfo.amount} ${transactionInfo.tokenSymbol}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Transaction Hash</span>
                    <span class="detail-value address-value">${operation.transactionHash}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Delay Period</span>
                    <span class="detail-value">${operation.delay} seconds (${Math.round(operation.delay / 3600)} hours)</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Ready Time</span>
                    <span class="detail-value">${new Date((Math.floor(Date.now() / 1000) + operation.delay) * 1000).toLocaleString()}</span>
                </div>
            </div>
        </div>
    `;
}

// Create generic transaction display (fallback)
function createGenericTransactionDisplay(operation) {
    return `
        <div class="operation-details transaction-display generic-transaction">
            <div class="transaction-summary">
                <div class="transaction-icon">${operation.calls.length > 1 ? '📦' : '⚙️'}</div>
                <div class="transaction-info">
                    <div class="transaction-title">${operation.calls.length > 1 ? 'Batch Operation' : 'Smart Contract Call'}</div>
                    <div class="transaction-subtitle">${operation.calls.length} call${operation.calls.length > 1 ? 's' : ''}</div>
                </div>
            </div>
            
            <div class="transaction-details">
                <div class="detail-row">
                    <span class="detail-label">Target${operation.calls.length > 1 ? 's' : ''}</span>
                    <span class="detail-value address-value">${operation.calls.map(call => call.target).join(', ')}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Value${operation.calls.length > 1 ? 's' : ''} (ETH)</span>
                    <span class="detail-value">${operation.calls.map(call => ethers.utils.formatEther(call.value)).join(', ')}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Transaction Hash</span>
                    <span class="detail-value address-value">${operation.transactionHash}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Delay Period</span>
                    <span class="detail-value">${operation.delay} seconds (${Math.round(operation.delay / 3600)} hours)</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Ready Time</span>
                    <span class="detail-value">${new Date((Math.floor(Date.now() / 1000) + operation.delay) * 1000).toLocaleString()}</span>
                </div>
            </div>
        </div>
    `;
}

// Helper function to format addresses for display
function formatAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Role checking functions
async function checkUserRole(roleName) {
    if (!contract || !currentUserAddress) {
        return false;
    }
    
    try {
        const roleHash = await contract[`${roleName}_ROLE`]();
        return await contract.hasRole(roleHash, currentUserAddress);
    } catch (error) {
        console.error(`Error checking ${roleName} role:`, error);
        return false;
    }
}

// Update connection status with address and roles
async function updateConnectionStatus() {
    if (!currentUserAddress) {
        connectionStatus.innerHTML = 'Not connected';
        return;
    }
    
    const shortAddress = `${currentUserAddress.slice(0, 6)}...${currentUserAddress.slice(-4)}`;
    
    try {
        const userRoles = await getUserRoles();
        
        if (userRoles.length > 0) {
            const roleText = userRoles.join(', ');
            connectionStatus.innerHTML = `Connected: ${shortAddress}<br><span class="user-roles">${roleText}</span>`;
        } else {
            connectionStatus.innerHTML = `Connected: ${shortAddress}`;
        }
    } catch (error) {
        console.error('Error updating connection status:', error);
        connectionStatus.innerHTML = `Connected: ${shortAddress}`;
    }
}

// Get all roles for the current user (for connection status display)
async function getUserRoles() {
    if (!contract || !currentUserAddress) {
        return [];
    }
    
    const roles = [];
    
    try {
        // Check each role
        const roleChecks = [
            { name: 'Proposer', function: 'PROPOSER' },
            { name: 'Canceller', function: 'CANCELLER' },
            { name: 'Executor', function: 'EXECUTOR' }
        ];
        
        for (const role of roleChecks) {
            // Special handling for executor role (check for zero address case)
            if (role.function === 'EXECUTOR') {
                const hasExecutorPermission = await checkExecutorPermission();
                if (hasExecutorPermission) {
                    // Only add executor role if it's not the zero address case
                    const executorRoleHash = await contract.EXECUTOR_ROLE();
                    const executors = await getRoleMembersFromEvents(executorRoleHash);
                    
                    // Don't show "Executor" if zero address is the only executor (anyone can execute)
                    if (!(executors.length === 1 && executors[0] === '0x0000000000000000000000000000000000000000')) {
                        const hasDirectRole = await contract.hasRole(executorRoleHash, currentUserAddress);
                        if (hasDirectRole) {
                            roles.push(role.name);
                        }
                    }
                }
            } else {
                const hasRole = await checkUserRole(role.function);
                if (hasRole) {
                    roles.push(role.name);
                }
            }
        }
        
        // Check for recovery role (RECOVERER_ROLE)
        const recovererRoleHash = await contract.RECOVERER_ROLE();
        const hasRecovererRole = await contract.hasRole(recovererRoleHash, currentUserAddress);
        if (hasRecovererRole) {
            roles.push('Recoverer');
        }
        
    } catch (error) {
        console.error('Error getting user roles:', error);
    }
    
    return roles;
}

// Special executor permission checking (handles zero address case)
async function checkExecutorPermission() {
    if (!contract || !currentUserAddress) {
        return false;
    }
    
    try {
        const executorRoleHash = await contract.EXECUTOR_ROLE();
        
        // Get all executor role members
        const executors = await getRoleMembersFromEvents(executorRoleHash);
        
        console.log('Current executors:', executors);
        
        // Special case: if the only executor is the zero address, anyone can execute
        if (executors.length === 1 && executors[0] === '0x0000000000000000000000000000000000000000') {
            console.log('Zero address is the only executor - anyone can execute');
            return true;
        }
        
        // Otherwise, check if current user has the executor role
        const hasExecutorRole = await contract.hasRole(executorRoleHash, currentUserAddress);
        console.log(`User ${formatAddress(currentUserAddress)} has executor role: ${hasExecutorRole}`);
        
        return hasExecutorRole;
        
    } catch (error) {
        console.error('Error checking executor permission:', error);
        return false;
    }
}

// Recovery trigger permission checking
async function checkRecoveryTriggerPermission() {
    if (!contract || !currentUserAddress) {
        return false;
    }
    
    try {
        const recoveryTriggerRoleHash = await contract.RECOVERY_TRIGGER_ROLE();
        const hasRecoveryTriggerRole = await contract.hasRole(recoveryTriggerRoleHash, currentUserAddress);
        console.log(`User ${formatAddress(currentUserAddress)} has recovery trigger role: ${hasRecoveryTriggerRole}`);
        
        return hasRecoveryTriggerRole;
    } catch (error) {
        console.error('Error checking recovery trigger permission:', error);
        return false;
    }
}

async function updateButtonStates() {
    if (!contract || !currentUserAddress) {
        // Reset to default disabled state when not connected
        window.userIsCanceller = false;
        window.userIsExecutor = false;
        window.userIsRecoveryTriggerer = false;
        window.userIsRecoverer = false;
        updateProposalButtons(false);
        return;
    }
    
    try {
        // Check if user is a proposer
        const isProposer = await checkUserRole('PROPOSER');
        const isCanceller = await checkUserRole('CANCELLER');
        
        // Check executor permissions (special case for zero address)
        const isExecutor = await checkExecutorPermission();
        
        // Check recovery trigger permissions
        const isRecoveryTriggerer = await checkRecoveryTriggerPermission();
        
        // Check recoverer permissions
        const isRecoverer = await checkRecovererPermission();
        
        console.log(`Role check for ${formatAddress(currentUserAddress)}: Proposer=${isProposer}, Canceller=${isCanceller}, Executor=${isExecutor}, RecoveryTriggerer=${isRecoveryTriggerer}, Recoverer=${isRecoverer}`);
        
        // Update propose buttons
        updateProposalButtons(isProposer);
        
        // Update recovery trigger button
        updateRecoveryTriggerButton(isRecoveryTriggerer);
        
        // Store role status for buttons
        window.userIsCanceller = isCanceller;
        window.userIsExecutor = isExecutor;
        window.userIsRecoveryTriggerer = isRecoveryTriggerer;
        window.userIsRecoverer = isRecoverer;
        
        // Update connection status with current roles
        await updateConnectionStatus();
        
    } catch (error) {
        console.error('Error updating button states:', error);
        // Default to no permissions on error
        window.userIsCanceller = false;
        window.userIsExecutor = false;
        window.userIsRecoveryTriggerer = false;
        window.userIsRecoverer = false;
        updateProposalButtons(false);
    }
}

function updateProposalButtons(isProposer) {
    const buttons = [proposeButton, proposeTokenTransferButton];
    
    buttons.forEach(button => {
        if (button) {
            if (!isProposer) {
                button.disabled = true;
                button.title = 'Connect a proposer account to schedule operations';
                button.classList.add('role-disabled');
            } else {
                // Only enable if not disabled for other reasons
                if (button.classList.contains('role-disabled')) {
                    button.disabled = false;
                    button.title = '';
                    button.classList.remove('role-disabled');
                }
            }
        }
    });
}

function updateRecoveryTriggerButton(isRecoveryTriggerer) {
    const recoveryButton = document.getElementById('triggerRecovery');
    
    if (recoveryButton) {
        if (!isRecoveryTriggerer) {
            recoveryButton.disabled = true;
            recoveryButton.title = 'Only Recovery Triggerers can activate recovery mode';
            recoveryButton.classList.add('role-disabled');
        } else {
            recoveryButton.disabled = false;
            recoveryButton.title = 'Click to trigger emergency recovery mode';
            recoveryButton.classList.remove('role-disabled');
        }
    }
}

async function cancelOperation(operationId) {
    if (!contract || !provider) {
        showError('Please connect your wallet first.');
        return;
    }

    try {
        // Get the signer for the transaction
        const signer = provider.getSigner();
        const contractWithSigner = contract.connect(signer);

        console.log('=== CANCEL DEBUG INFO ===');
        console.log('Operation ID:', operationId);

        // Show confirmation
        if (!confirm(`Are you sure you want to cancel operation ${operationId}?\n\nThis action cannot be undone. The operation will be permanently cancelled.`)) {
            return;
        }

        showProposalStatus('Cancelling operation...', 'pending');

        // Call the cancel function
        const tx = await contractWithSigner.cancel(operationId);
        
        console.log('Cancel transaction hash:', tx.hash);
        showProposalStatus('Cancel transaction submitted. Waiting for confirmation...', 'pending');

        // Wait for transaction confirmation
        const receipt = await tx.wait();
        console.log('Cancel transaction confirmed:', receipt);

        showProposalStatus(`Operation cancelled successfully!`, 'success');

        // Refresh the operations list
        setTimeout(() => {
            loadContractData();
        }, 2000);

    } catch (error) {
        console.error('Error cancelling operation:', error);
        showError(`Failed to cancel operation: ${error.message}`);
        showProposalStatus('', 'hidden');
    }
}

async function executeOperation(operationId, calls, predecessor, salt) {
    if (!contract || !provider) {
        showError('Please connect your wallet first.');
        return;
    }

    try {
        // Get the signer for the transaction
        const signer = provider.getSigner();
        const contractWithSigner = contract.connect(signer);

        // Enhanced debugging - log all parameters
        console.log('=== EXECUTION DEBUG INFO ===');
        console.log('Operation ID:', operationId);
        console.log('Calls:', calls);
        console.log('Predecessor:', predecessor);
        console.log('Salt:', salt);
        console.log('Salt type:', typeof salt);
        console.log('Salt length:', salt.length);

        // Show confirmation
        if (!confirm(`Are you sure you want to execute operation ${operationId}?\n\nThis will execute the scheduled operation with the following parameters:\n- Operation ID: ${operationId}\n- Calls: ${calls.length}\n- Predecessor: ${predecessor}\n- Salt: ${salt}`)) {
            return;
        }

        showProposalStatus('Preparing execution...', 'pending');

        // For debugging, let's verify the operation hash matches
        if (calls.length === 1) {
            const call = calls[0];
            console.log('Single call details:', {
                target: call.target,
                value: call.value,
                valueType: typeof call.value,
                data: call.data,
                predecessor,
                salt
            });
            
            try {
                // Convert string value back to BigNumber for hash calculation
                const valueBigNumber = ethers.BigNumber.from(call.value);
                console.log('Value as BigNumber:', valueBigNumber.toString());
                
                const calculatedHash = await contract.hashOperation(
                    call.target,
                    valueBigNumber,
                    call.data,
                    predecessor,
                    salt
                );
                console.log('Expected operation ID:', operationId);
                console.log('Calculated hash:', calculatedHash);
                console.log('Hashes match:', calculatedHash.toLowerCase() === operationId.toLowerCase());
                
                if (calculatedHash.toLowerCase() !== operationId.toLowerCase()) {
                    showProposalStatus('Error: Parameter mismatch detected. Cannot execute operation.', 'error');
                    console.log('=== PARAMETER MISMATCH DETAILS ===');
                    console.log('This could be due to:');
                    console.log('1. Wrong salt value');
                    console.log('2. Wrong predecessor value');
                    console.log('3. Data encoding issues');
                    return;
                }
            } catch (error) {
                console.error('Error verifying operation hash:', error);
                showProposalStatus('Error verifying operation parameters: ' + error.message, 'error');
                return;
            }
        }

        let tx;
        if (calls.length === 1) {
            // Single call execution
            const call = calls[0];
            
            // Convert string value to BigNumber for execution
            const valueBigNumber = ethers.BigNumber.from(call.value);
            
            console.log('Executing single call with exact parameters:', {
                target: call.target,
                value: valueBigNumber.toString(),
                valueBigNumber: valueBigNumber,
                data: call.data,
                predecessor,
                salt
            });
            
            tx = await contractWithSigner.execute(
                call.target,
                valueBigNumber, // Use BigNumber instead of string
                call.data,
                predecessor,
                salt
            );
        } else {
            // Batch execution
            const targets = calls.map(call => call.target);
            const values = calls.map(call => ethers.BigNumber.from(call.value)); // Convert all values to BigNumber
            const payloads = calls.map(call => call.data);
            
            console.log('Executing batch with exact parameters:', {
                targets,
                values: values.map(v => v.toString()),
                valuesBigNumbers: values,
                payloads,
                predecessor,
                salt
            });
            
            tx = await contractWithSigner.executeBatch(
                targets,
                values, // Use BigNumber array instead of string array
                payloads,
                predecessor,
                salt
            );
        }

        showProposalStatus('Execution submitted! Waiting for confirmation...', 'pending');

        // Wait for transaction to be mined
        const receipt = await tx.wait();

        showProposalStatus(
            `Operation executed successfully! Transaction Hash: ${receipt.transactionHash}`, 
            'success'
        );

        // Refresh the operations list to show updated status
        setTimeout(() => {
            loadScheduledOperations();
        }, 2000);

        console.log('Execution successful:', {
            operationId,
            txHash: receipt.transactionHash
        });

    } catch (error) {
        console.error('Error executing operation:', error);
        
        let errorMsg = 'Failed to execute operation: ';
        if (error.code === 4001) {
            errorMsg += 'Transaction rejected by user.';
        } else if (error.message.includes('AccessControlUnauthorizedAccount') || error.message.includes('0xe2517d3f')) {
            errorMsg += 'You do not have the EXECUTOR_ROLE required to execute operations. Please check the "Executors" section to see who can execute operations, or ask an admin to grant you the EXECUTOR_ROLE.';
        } else if (error.message.includes('AccessControl')) {
            errorMsg += 'You do not have the required role to execute operations.';
        } else if (error.message.includes('TimelockController: operation is not ready')) {
            errorMsg += 'Operation is not ready for execution yet.';
        } else if (error.message.includes('TimelockController: operation cannot be executed')) {
            errorMsg += 'Operation cannot be executed (may already be executed or cancelled).';
        } else if (error.message.includes('custom error 0xe2517d3f')) {
            errorMsg += 'You do not have the EXECUTOR_ROLE required to execute operations. Please check the "Executors" section to see who can execute operations.';
        } else if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
            errorMsg += 'Transaction would fail. This might be due to insufficient permissions or the operation not being ready for execution.';
        } else {
            errorMsg += error.message;
        }
        
        showProposalStatus(errorMsg, 'error');
    }
}

// Trigger recovery mode
async function triggerRecovery() {
    console.log('triggering recovery');
    
    if (!contract || !provider) {
        showError('Please connect your wallet first.');
        return;
    }

    // Double check permissions
    const hasPermission = await checkRecoveryTriggerPermission();
    if (!hasPermission) {
        showError('You do not have permission to trigger recovery mode.');
        return;
    }

    // Confirm with user before triggering recovery
    const confirmed = confirm(
        '⚠️ WARNING: You are about to trigger RECOVERY MODE.\n\n' +
        'This will:\n' +
        '• Immediately bypass the timelock for all pending operations\n' +
        '• Allow immediate execution of all scheduled transactions\n' +
        '• Cannot be undone once triggered\n\n' +
        'Are you absolutely sure you want to continue?'
    );

    if (!confirmed) {
        return;
    }

    try {
        recoveryTriggerButton.disabled = true;
        recoveryTriggerButton.textContent = 'Triggering Recovery...';

        const signer = provider.getSigner();
        const contractWithSigner = contract.connect(signer);

        // Trigger recovery mode (this calls the emergency recovery function in the contract)
        const tx = await contractWithSigner.triggerRecoveryMode();
        
        console.log('Recovery trigger transaction sent:', tx.hash);
        
        // Wait for confirmation
        const receipt = await tx.wait();
        console.log('Recovery triggered successfully:', receipt);

        // Show success message
        alert('🚨 RECOVERY MODE ACTIVATED!\n\nPage will refresh to update the interface.');

        // Force page refresh to update recovery mode UI
        window.location.reload();

    } catch (error) {
        console.error('Error triggering recovery:', error);
        let errorMsg = 'Failed to trigger recovery mode.';
        
        if (error.message.includes('user rejected')) {
            errorMsg = 'Transaction rejected by user.';
        } else if (error.message.includes('insufficient funds')) {
            errorMsg = 'Insufficient funds for transaction.';
        } else if (error.message.includes('AccessControl')) {
            errorMsg = 'Access denied: You do not have recovery trigger permissions.';
        }
        
        showError(errorMsg);
    } finally {
        recoveryTriggerButton.disabled = false;
        recoveryTriggerButton.textContent = '🚨 TRIGGER RECOVERY MODE';
    }
}

// Exit recovery mode
async function exitRecoveryMode() {
    if (!contract || !provider) {
        showError('Please connect your wallet first.');
        return;
    }

    const hasPermission = await checkRecovererPermission();
    if (!hasPermission) {
        showError('You do not have permission to exit recovery mode.');
        return;
    }

    const confirmed = confirm('Are you sure you want to exit recovery mode?\n\nThis will restore normal timelock delays for all future operations.');
    if (!confirmed) return;

    try {
        const exitButton = document.getElementById('exitRecoveryMode');
        exitButton.disabled = true;
        exitButton.textContent = 'Exiting Recovery Mode...';

        const signer = provider.getSigner();
        const contractWithSigner = contract.connect(signer);
        const tx = await contractWithSigner.exitRecoveryMode();
        
        console.log('Exit recovery transaction sent:', tx.hash);
        const receipt = await tx.wait();
        console.log('Recovery mode exited successfully:', receipt);

        alert('✅ Recovery mode exited successfully!\n\nNormal timelock delays are now restored.');
        await loadContractData();

    } catch (error) {
        console.error('Error exiting recovery mode:', error);
        let errorMsg = 'Failed to exit recovery mode.';
        
        if (error.message.includes('user rejected')) {
            errorMsg = 'Transaction rejected by user.';
        } else if (error.message.includes('AccessControl')) {
            errorMsg = 'Access denied: You do not have recoverer permissions.';
        }
        
        showError(errorMsg);
    } finally {
        const exitButton = document.getElementById('exitRecoveryMode');
        exitButton.disabled = false;
        exitButton.textContent = '🔒 EXIT RECOVERY MODE';
    }
}

// Cancel all operations
async function cancelAllOperations() {
    if (!contract || !provider) {
        showError('Please connect your wallet first.');
        return;
    }

    const hasPermission = await checkRecovererPermission();
    if (!hasPermission) {
        showError('You do not have permission to cancel all operations.');
        return;
    }

    const confirmed = confirm('⚠️ WARNING: This will cancel ALL pending operations!\n\nThis action cannot be undone. Are you sure?');
    if (!confirmed) return;

    try {
        const cancelButton = document.getElementById('cancelAllOperations');
        cancelButton.disabled = true;
        cancelButton.textContent = 'Cancelling All Operations...';

        const signer = provider.getSigner();
        const contractWithSigner = contract.connect(signer);
        const tx = await contractWithSigner.cancelAllOperations();
        
        console.log('Cancel all operations transaction sent:', tx.hash);
        const receipt = await tx.wait();
        console.log('All operations cancelled successfully:', receipt);

        alert('✅ All pending operations have been cancelled!');
        await loadScheduledOperations();

    } catch (error) {
        console.error('Error cancelling all operations:', error);
        let errorMsg = 'Failed to cancel all operations.';
        
        if (error.message.includes('user rejected')) {
            errorMsg = 'Transaction rejected by user.';
        } else if (error.message.includes('AccessControl')) {
            errorMsg = 'Access denied: You do not have recoverer permissions.';
        }
        
        showError(errorMsg);
    } finally {
        const cancelButton = document.getElementById('cancelAllOperations');
        cancelButton.disabled = false;
        cancelButton.textContent = '❌ CANCEL ALL OPERATIONS';
    }
}

// Role management functions
function showGrantRoleForm(roleFunction, roleName) {
    const form = document.getElementById(`grant-${roleFunction}-form`);
    form.style.display = 'flex';
    document.getElementById(`grant-${roleFunction}-address`).focus();
}

function hideGrantRoleForm(roleFunction) {
    const form = document.getElementById(`grant-${roleFunction}-form`);
    form.style.display = 'none';
    document.getElementById(`grant-${roleFunction}-address`).value = '';
}

async function grantRoleToAddress(roleFunction, roleName) {
    if (!contract || !provider) {
        showError('Please connect your wallet first.');
        return;
    }

    const hasPermission = await checkRecovererPermission();
    if (!hasPermission) {
        showError('You do not have permission to grant roles.');
        return;
    }

    const addressInput = document.getElementById(`grant-${roleFunction}-address`);
    const address = addressInput.value.trim();

    if (!address) {
        showError('Please enter an address.');
        return;
    }

    if (!ethers.utils.isAddress(address)) {
        showError('Invalid address format.');
        return;
    }

    try {
        const signer = provider.getSigner();
        const contractWithSigner = contract.connect(signer);
        const roleHash = await contract[roleFunction]();
        
        const tx = await contractWithSigner.grantRole(roleHash, address);
        console.log('Grant role transaction sent:', tx.hash);
        
        const receipt = await tx.wait();
        console.log('Role granted successfully:', receipt);

        alert(`✅ ${roleName} role granted to ${formatAddress(address)}`);
        
        // Refresh the recovery role management UI
        await loadRecoveryRoleManagement();
        hideGrantRoleForm(roleFunction);
        
        // Update connection status in case the current user's roles changed
        await updateConnectionStatus();

    } catch (error) {
        console.error('Error granting role:', error);
        let errorMsg = 'Failed to grant role.';
        
        if (error.message.includes('user rejected')) {
            errorMsg = 'Transaction rejected by user.';
        } else if (error.message.includes('AccessControl')) {
            errorMsg = 'Access denied: You do not have recoverer permissions.';
        }
        
        showError(errorMsg);
    }
}

async function revokeRoleFromMember(roleFunction, memberAddress) {
    if (!contract || !provider) {
        showError('Please connect your wallet first.');
        return;
    }

    const hasPermission = await checkRecovererPermission();
    if (!hasPermission) {
        showError('You do not have permission to revoke roles.');
        return;
    }

    const confirmed = confirm(`Are you sure you want to revoke the role from ${formatAddress(memberAddress)}?`);
    if (!confirmed) return;

    try {
        const signer = provider.getSigner();
        const contractWithSigner = contract.connect(signer);
        const roleHash = await contract[roleFunction]();
        
        const tx = await contractWithSigner.revokeRole(roleHash, memberAddress);
        console.log('Revoke role transaction sent:', tx.hash);
        
        const receipt = await tx.wait();
        console.log('Role revoked successfully:', receipt);

        alert(`✅ Role revoked from ${formatAddress(memberAddress)}`);
        
        // Refresh the recovery role management UI
        await loadRecoveryRoleManagement();
        
        // Update connection status in case the current user's roles changed
        await updateConnectionStatus();

    } catch (error) {
        console.error('Error revoking role:', error);
        let errorMsg = 'Failed to revoke role.';
        
        if (error.message.includes('user rejected')) {
            errorMsg = 'Transaction rejected by user.';
        } else if (error.message.includes('AccessControl')) {
            errorMsg = 'Access denied: You do not have recoverer permissions.';
        }
        
        showError(errorMsg);
    }
}

async function proposeTransaction() {
    if (!contract || !provider) {
        showError('Please connect your wallet first.');
        return;
    }

    try {
        // Get form values
        const targetAddress = document.getElementById('targetAddress').value.trim();
        const value = document.getElementById('value').value.trim();
        const calldata = document.getElementById('calldata').value.trim();
        const saltInput = document.getElementById('salt').value.trim();
        const delayInput = document.getElementById('delay').value.trim();

        // Validate required fields
        if (!targetAddress) {
            showError('Target address is required.');
            return;
        }

        if (!ethers.utils.isAddress(targetAddress)) {
            showError('Invalid target address.');
            return;
        }

        // Parse values
        const valueWei = value ? ethers.utils.parseEther(value) : ethers.BigNumber.from(0);
        const data = calldata || '0x';
        const predecessor = ethers.constants.HashZero; // No predecessor requirement
        
        // Generate salt if not provided
        let salt;
        if (saltInput) {
            salt = ethers.utils.formatBytes32String(saltInput);
        } else {
            // Generate random salt
            const randomBytes = ethers.utils.randomBytes(32);
            salt = ethers.utils.hexlify(randomBytes);
        }

        // Get delay (use minimum delay if not specified)
        let delay;
        if (delayInput) {
            delay = parseInt(delayInput);
        } else {
            const minDelay = await contract.getMinDelay();
            delay = minDelay.toNumber();
        }

        showProposalStatus('Preparing transaction...', 'pending');
        proposeButton.disabled = true;

        // Get the signer for the transaction
        const signer = provider.getSigner();
        const contractWithSigner = contract.connect(signer);

        // Generate operation hash for reference
        const operationHash = await contract.hashOperation(
            targetAddress,
            valueWei,
            data,
            predecessor,
            salt
        );

        showProposalStatus('Submitting transaction to blockchain...', 'pending');

        // Call the schedule function
        const tx = await contractWithSigner.schedule(
            targetAddress,
            valueWei,
            data,
            predecessor,
            salt,
            delay
        );

        showProposalStatus('Transaction submitted! Waiting for confirmation...', 'pending');

        // Wait for transaction to be mined
        const receipt = await tx.wait();

        showProposalStatus(
            `Transaction proposed successfully! 
            Transaction Hash: ${receipt.transactionHash}
            Operation Hash: ${operationHash}
            Ready for execution after delay period.`, 
            'success'
        );

        // Clear form
        document.getElementById('targetAddress').value = '';
        document.getElementById('value').value = '';
        document.getElementById('calldata').value = '';
        document.getElementById('salt').value = '';
        document.getElementById('delay').value = '';

        // Automatically refresh operations after successful proposal
        setTimeout(() => {
            loadScheduledOperations();
        }, 1000);

        // Auto-switch to operations tab after successful transaction
        setTimeout(() => {
            switchMainTab('operations');
        }, 1500);

        console.log('Proposal successful:', {
            txHash: receipt.transactionHash,
            operationHash: operationHash,
            target: targetAddress,
            value: valueWei.toString(),
            data: data,
            salt: salt,
            delay: delay
        });

    } catch (error) {
        console.error('Error proposing transaction:', error);
        
        let errorMsg = 'Failed to propose transaction: ';
        if (error.code === 4001) {
            errorMsg += 'Transaction rejected by user.';
        } else if (error.message.includes('AccessControl')) {
            errorMsg += 'You do not have the PROPOSER_ROLE required to propose transactions.';
        } else if (error.message.includes('TimelockController: insufficient delay')) {
            errorMsg += 'The specified delay is less than the minimum required delay.';
        } else {
            errorMsg += error.message;
        }
        
        showProposalStatus(errorMsg, 'error');
    } finally {
        proposeButton.disabled = false;
    }
}

// Initialize when page loads
window.addEventListener('load', async () => {
    console.log('Page loaded, waiting for ethers and checking wallet...');
    try {
        await waitForEthers();
        initializeTokenList(); // Initialize token dropdown
        checkWallet();
    } catch (error) {
        console.error('Failed to initialize:', error);
        showError('Failed to load required libraries. Please refresh the page.');
    }
});

// Also check when DOM is ready (in case MetaMask loads after window.load)
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, checking wallet...');
    initializeTokenList(); // Initialize token dropdown
    // Add a delay to ensure MetaMask has time to inject itself
    setTimeout(async () => {
        if (connectButton.textContent === 'Connect Wallet' || connectButton.textContent === 'Install MetaMask') {
            try {
                await waitForEthers();
                checkWallet();
            } catch (error) {
                console.error('Failed to initialize on DOM ready:', error);
            }
        }
    }, 1000);
});

// Listen for MetaMask to be injected (some browsers load it asynchronously)
if (typeof window.ethereum === 'undefined') {
    let attempts = 0;
    const checkForMetaMask = setInterval(() => {
        attempts++;
        console.log(`Checking for MetaMask, attempt ${attempts}`);
        
        if (typeof window.ethereum !== 'undefined') {
            console.log('MetaMask found after waiting');
            clearInterval(checkForMetaMask);
            checkWallet();
        } else if (attempts >= 10) {
            console.log('Gave up waiting for MetaMask');
            clearInterval(checkForMetaMask);
        }
    }, 500);
}

// Auto-refresh functionality for operations
function startAutoRefresh() {
    // Don't start multiple intervals
    if (autoRefreshInterval) {
        return;
    }
    
    console.log('Starting auto-refresh for operations...');
    autoRefreshInterval = setInterval(() => {
        console.log('Auto-refreshing operations...');
        loadScheduledOperations();
    }, 10000); // Refresh every 10 seconds
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        console.log('Stopping auto-refresh for operations...');
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

// Balance auto-refresh functionality
function startBalanceRefresh() {
    // Don't start multiple intervals
    if (balanceRefreshInterval) {
        return;
    }
    
    console.log('Starting auto-refresh for contract balance...');
    balanceRefreshInterval = setInterval(() => {
        console.log('Auto-refreshing contract balance...');
        loadContractBalance();
    }, 5000); // Refresh every 5 seconds
}

function stopBalanceRefresh() {
    if (balanceRefreshInterval) {
        console.log('Stopping auto-refresh for contract balance...');
        clearInterval(balanceRefreshInterval);
        balanceRefreshInterval = null;
    }
}

// Helper function to reset event data (useful for debugging or if something goes wrong)
function resetEventData() {
    console.log('Resetting event data...');
    lastQueriedBlock = 0;
    allScheduledEvents = [];
    allExecutedEvents = [];
    allCancelledEvents = [];
    allSaltEvents = [];
    lastEventsHash = null;
    lastOperationStatesHash = null;
    console.log('Event data and UI state reset. Next loadScheduledOperations() call will query from block 0 and rebuild UI.');
}

// Helper function to generate a hash of the current events state
function generateEventsHash() {
    // Create a simple hash based on event counts and IDs
    const scheduledIds = allScheduledEvents.map(e => e.args.id + e.blockNumber).sort();
    const executedIds = allExecutedEvents.map(e => e.args.id + e.blockNumber).sort();
    const cancelledIds = allCancelledEvents.map(e => e.args.id + e.blockNumber).sort();
    const saltIds = allSaltEvents.map(e => e.args.id + e.blockNumber).sort();
    
    // Combine all into a single string and generate a simple hash
    const combined = JSON.stringify({
        scheduled: scheduledIds,
        executed: executedIds,
        cancelled: cancelledIds,
        salt: saltIds
    });
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
        const char = combined.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
}

// Helper function to generate a hash of operation states
async function generateOperationStatesHash(operationIds) {
    if (!contract || operationIds.length === 0) {
        return 'empty';
    }
    
    try {
        // Get current states for all operations
        const statePromises = operationIds.map(async (id) => {
            try {
                const state = await contract.getOperationState(id);
                return `${id}:${state}`;
            } catch (error) {
                console.error(`Error getting state for operation ${id}:`, error);
                return `${id}:error`;
            }
        });
        
        const states = await Promise.all(statePromises);
        const statesString = states.sort().join('|');
        
        // Simple hash function
        let hash = 0;
        for (let i = 0; i < statesString.length; i++) {
            const char = statesString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString();
    } catch (error) {
        console.error('Error generating operation states hash:', error);
        return 'error';
    }
}
