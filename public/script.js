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
const CONTRACT_ADDRESS = '0x0165878A594ca255338adfa4d48449f69242Eb8F'; // Update with your deployed contract address
const CONTRACT_ABI = [
    // TimelockController functions we need
    "function getMinDelay() view returns (uint256)",
    "function hasRole(bytes32 role, address account) view returns (bool)",
    "function getRoleAdmin(bytes32 role) view returns (bytes32)",
    "function schedule(address target, uint256 value, bytes calldata data, bytes32 predecessor, bytes32 salt, uint256 delay)",
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

let provider;
let contract;
let autoRefreshInterval = null;
let balanceRefreshInterval = null;

// Persistent event data for efficient incremental loading
let lastQueriedBlock = 0;
let allScheduledEvents = [];
let allExecutedEvents = [];
let allCancelledEvents = [];
let allSaltEvents = [];
let lastEventsHash = null;

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

// Check if wallet is available on page load
async function checkWallet() {
    console.log('Checking wallet...', typeof window.ethereum);
    
    if (typeof window.ethereum !== 'undefined') {
        console.log('MetaMask detected');
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
        console.log('userAddress', userAddress);
        console.log('accounts', accounts);
        
        
        
        contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, provider);
        
        connectionStatus.textContent = `Connected: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
        connectButton.style.display = 'none';
        disconnectButton.style.display = 'inline-block';
        
        contractInfo.style.display = 'block';
        await loadContractData();
        
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
                    connectionStatus.textContent = `Connected: ${newAddress.slice(0, 6)}...${newAddress.slice(-4)}`;
                    
                    // Reload contract data for new account
                    await loadContractData();
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
    
    // Reset event data
    lastQueriedBlock = 0;
    allScheduledEvents = [];
    allExecutedEvents = [];
    allCancelledEvents = [];
    allSaltEvents = [];
    lastEventsHash = null;
    
    // Stop auto-refresh
    stopAutoRefresh();
    
    // Stop balance refresh
    stopBalanceRefresh();
    
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
        
        // Load contract balance
        await loadContractBalance();
        
        // Start auto-refresh for contract balance
        startBalanceRefresh();
        
        // Load role assignments
        await loadRoleMembers();
        
        // Load scheduled operations
        await loadScheduledOperations();
        
    } catch (error) {
        showError('Failed to load contract data: ' + error.message);
    }
}

async function loadContractBalance() {
    try {
        
        const balance = await provider.getBalance(CONTRACT_ADDRESS);
        

        const balanceEth = ethers.utils.formatEther(balance);
        document.getElementById('contractBalance').textContent = `${balanceEth} ETH`;
    } catch (error) {
        console.error('Failed to load contract balance:', error);
        document.getElementById('contractBalance').textContent = 'Error loading balance';
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
            
            displayRoleMembers(roleInfo.listId, roleInfo.loadingId, members);
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

function displayRoleMembers(listId, loadingId, members) {
    const loadingElement = document.getElementById(loadingId);
    const listElement = document.getElementById(listId);
    
    loadingElement.style.display = 'none';
    listElement.style.display = 'block';
    listElement.innerHTML = '';
    
    if (members.length === 0) {
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
        
        if (eventsChanged) {
            console.log('Events changed, updating UI...');
            lastEventsHash = currentEventsHash;
            
            // Show loading state only when rebuilding UI
            operationsLoading.style.display = 'block';
            operationsList.style.display = 'none';
            noOperations.style.display = 'none';
            operationsCount.textContent = 'Loading...';
        } else {
            console.log('No events changes detected, skipping UI update...');
            // Still need to re-enable refresh button
            refreshOperationsButton.disabled = false;
            return; // Skip UI rebuild
        }

        // Display operations (only if events changed)
        operationsLoading.style.display = 'none';
        operationsCount.textContent = `${operations.length} operation${operations.length !== 1 ? 's' : ''}`;

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
    
    div.innerHTML = `
        <div class="operation-header">
            <div class="operation-id">ID: ${operation.id}</div>
            <div class="operation-status ${operation.statusClass}">${operation.status}</div>
        </div>
        <div class="operation-details">
            <div class="operation-field">
                <div class="operation-field-label">Target${operation.calls.length > 1 ? 's' : ''}</div>
                <div class="operation-field-value">${operation.calls.map(call => call.target).join(', ')}</div>
            </div>
            <div class="operation-field">
                <div class="operation-field-label">Value${operation.calls.length > 1 ? 's' : ''} (ETH)</div>
                <div class="operation-field-value">${operation.calls.map(call => ethers.utils.formatEther(call.value)).join(', ')}</div>
            </div>
            <div class="operation-field">
                <div class="operation-field-label">Transaction Hash</div>
                <div class="operation-field-value">${operation.transactionHash}</div>
            </div>
            <div class="operation-field">
                <div class="operation-field-label">Delay</div>
                <div class="operation-field-value">${operation.delay} seconds (${Math.round(operation.delay / 3600)} hours)</div>
            </div>
            <div class="operation-field operation-time">
                <div class="operation-field-label">Ready Time (estimated)</div>
                <div class="operation-field-value">${readyDate.toLocaleString()}</div>
            </div>
        </div>
        <div class="operation-actions">
            ${operation.status === 'Ready' ? 
                `<button class="execute-button" onclick="executeOperation('${operation.id}', ${JSON.stringify(operation.calls).replace(/"/g, '&quot;')}, '${operation.predecessor}', '${operation.salt}')">
                    Execute
                </button>` : 
                ''
            }
        </div>
    `;
    
    return div;
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
        checkWallet();
    } catch (error) {
        console.error('Failed to initialize:', error);
        showError('Failed to load required libraries. Please refresh the page.');
    }
});

// Also check when DOM is ready (in case MetaMask loads after window.load)
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, checking wallet...');
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
