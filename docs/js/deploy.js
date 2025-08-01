// deploy.js - TimelockVault deployment functionality

// TimelockVault constructor ABI for deployment
const TIMELOCK_VAULT_BYTECODE = null; // This will need to be set with actual bytecode

const TIMELOCK_VAULT_CONSTRUCTOR_ABI = [
    "constructor(uint256 minDelay, address[] memory proposers, address[] memory executors, address[] memory recoveryTriggerers, address[] memory recoverers)"
];

// Deployment state management
let deploymentInProgress = false;

// Initialize deployment tab
function initializeDeploymentTab() {
    // Add event listeners for dynamic lists
    setupRoleListManagement();
    
    // Add deployment button listener
    const deployButton = document.getElementById('deployTimelockVault');
    if (deployButton) {
        deployButton.addEventListener('click', deployTimelockVault);
    }
    
    // Initialize time inputs with default values
    initializeTimeInputs();
    
    console.log('Deployment tab initialized');
}

// Initialize time inputs and set up validation
function initializeTimeInputs() {
    const timeInputs = ['delayDays', 'delayHours', 'delayMinutes', 'delaySeconds'];
    
    timeInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            // Set initial value to 0
            input.value = '0';
            
            // Add input validation
            input.addEventListener('input', validateTimeInput);
            input.addEventListener('blur', normalizeTimeInput);
        }
    });
    
    // Set default to 1 hour (3600 seconds)
    document.getElementById('delayHours').value = '1';
    updateDelayFromTimeInputs();
}

// Validate time input constraints
function validateTimeInput(event) {
    const input = event.target;
    const value = parseInt(input.value) || 0;
    
    // Apply constraints based on input type
    switch (input.id) {
        case 'delayHours':
            if (value > 23) input.value = '23';
            break;
        case 'delayMinutes':
            if (value > 59) input.value = '59';
            break;
        case 'delaySeconds':
            if (value > 59) input.value = '59';
            break;
        case 'delayDays':
            if (value > 999) input.value = '999';
            break;
    }
    
    // Ensure non-negative values
    if (value < 0) input.value = '0';
    
    updateDelayFromTimeInputs();
}

// Normalize time input values on blur
function normalizeTimeInput(event) {
    const input = event.target;
    const value = parseInt(input.value);
    
    // Set to 0 if empty or invalid
    if (isNaN(value) || value < 0) {
        input.value = '0';
        updateDelayFromTimeInputs();
    }
}

// Update total delay from time inputs
function updateDelayFromTimeInputs() {
    const days = parseInt(document.getElementById('delayDays').value) || 0;
    const hours = parseInt(document.getElementById('delayHours').value) || 0;
    const minutes = parseInt(document.getElementById('delayMinutes').value) || 0;
    const seconds = parseInt(document.getElementById('delaySeconds').value) || 0;
    
    // Calculate total seconds
    const totalSeconds = (days * 24 * 60 * 60) + (hours * 60 * 60) + (minutes * 60) + seconds;
    
    // Update hidden input
    const minDelayInput = document.getElementById('minDelay');
    if (minDelayInput) {
        minDelayInput.value = totalSeconds;
    }
    
    // Update display
    const delayDisplay = document.getElementById('delayDisplay');
    if (delayDisplay) {
        delayDisplay.textContent = `Total delay: ${formatDelay(totalSeconds)}`;
    }
    
    // Update deployment button state
    updateDeploymentButtonState();
}

// Format delay for display
function formatDelay(totalSeconds) {
    if (totalSeconds === 0) return '0 seconds';
    
    const days = Math.floor(totalSeconds / (24 * 60 * 60));
    const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
    const seconds = totalSeconds % 60;
    
    const parts = [];
    if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    if (seconds > 0) parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
    
    return parts.join(', ') + ` (${totalSeconds} seconds)`;
}

// Make updateDelayFromTimeInputs available globally
window.updateDelayFromTimeInputs = updateDelayFromTimeInputs;

// Setup dynamic role list management
function setupRoleListManagement() {
    const roleTypes = ['proposers', 'executors', 'cancellers', 'recoveryTriggerers', 'recoverers'];
    
    roleTypes.forEach(roleType => {
        // Add address button
        const addButton = document.getElementById(`add${capitalizeFirst(roleType)}Address`);
        if (addButton) {
            addButton.addEventListener('click', () => addRoleAddress(roleType));
        }
        
        // Enter key support for input fields
        const input = document.getElementById(`new${capitalizeFirst(roleType)}Address`);
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    addRoleAddress(roleType);
                }
            });
        }
    });
    
    // Special handling for executors "anyone can execute" checkbox
    const anyoneExecuteCheckbox = document.getElementById('anyoneCanExecute');
    if (anyoneExecuteCheckbox) {
        anyoneExecuteCheckbox.addEventListener('change', handleAnyoneCanExecuteChange);
    }
}

// Handle "anyone can execute" checkbox
function handleAnyoneCanExecuteChange() {
    const checkbox = document.getElementById('anyoneCanExecute');
    const executorsList = document.getElementById('executorsList');
    const executorsInput = document.getElementById('newExecutorsAddress');
    const addExecutorButton = document.getElementById('addExecutorsAddress');
    
    if (checkbox.checked) {
        // Disable executor management and clear list
        executorsInput.disabled = true;
        addExecutorButton.disabled = true;
        executorsList.innerHTML = '<div class="role-item anyone-execute">🔓 Anyone can execute operations (zero address will be used)</div>';
    } else {
        // Enable executor management
        executorsInput.disabled = false;
        addExecutorButton.disabled = false;
        executorsList.innerHTML = '';
    }
}

// Add address to role list
function addRoleAddress(roleType) {
    const input = document.getElementById(`new${capitalizeFirst(roleType)}Address`);
    const list = document.getElementById(`${roleType}List`);
    const address = input.value.trim();
    
    if (!address) {
        showDeploymentError(`Please enter a valid address for ${roleType}`);
        return;
    }
    
    if (!ethers.utils.isAddress(address)) {
        showDeploymentError('Invalid address format');
        return;
    }
    
    // Check for duplicates
    const existingAddresses = Array.from(list.querySelectorAll('.role-address')).map(el => el.textContent);
    if (existingAddresses.includes(address)) {
        showDeploymentError('Address already added to this role');
        return;
    }
    
    // Add to list
    const roleItem = document.createElement('div');
    roleItem.className = 'role-item';
    roleItem.innerHTML = `
        <span class="role-address">${address}</span>
        <button class="remove-role-button" onclick="removeRoleAddress(this)" title="Remove address">×</button>
    `;
    
    list.appendChild(roleItem);
    input.value = '';
    
    // Update deployment button state
    updateDeploymentButtonState();
}

// Remove address from role list
function removeRoleAddress(button) {
    button.parentElement.remove();
    updateDeploymentButtonState();
}

// Update deployment button state
function updateDeploymentButtonState() {
    const deployButton = document.getElementById('deployTimelockVault');
    const minDelay = document.getElementById('minDelay').value;
    
    if (!deployButton) return;
    
    const canDeploy = minDelay && parseInt(minDelay) > 0 && !deploymentInProgress;
    deployButton.disabled = !canDeploy;
}

// Collect deployment parameters
function collectDeploymentParameters() {
    const minDelay = parseInt(document.getElementById('minDelay').value);
    
    // Collect role addresses
    const proposers = collectRoleAddresses('proposersList');
    const cancellers = collectRoleAddresses('cancellersList');
    const recoveryTriggerers = collectRoleAddresses('recoveryTriggerersList');
    const recoverers = collectRoleAddresses('recoverersList');
    
    // Handle executors (special case for "anyone can execute")
    let executors;
    const anyoneCanExecute = document.getElementById('anyoneCanExecute').checked;
    if (anyoneCanExecute) {
        executors = ['0x0000000000000000000000000000000000000000'];
    } else {
        executors = collectRoleAddresses('executorsList');
    }
    
    return {
        minDelay,
        proposers,
        executors,
        cancellers,
        recoveryTriggerers,
        recoverers
    };
}

// Collect addresses from a role list
function collectRoleAddresses(listId) {
    const list = document.getElementById(listId);
    if (!list) return [];
    
    return Array.from(list.querySelectorAll('.role-address')).map(el => el.textContent);
}

// Deploy TimelockVault contract
async function deployTimelockVault() {
    if (!provider) {
        showDeploymentError('Please connect your wallet first');
        return;
    }
    
    if (deploymentInProgress) {
        return;
    }
    
    try {
        deploymentInProgress = true;
        const deployButton = document.getElementById('deployTimelockVault');
        deployButton.disabled = true;
        deployButton.textContent = 'Deploying...';
        
        showDeploymentStatus('Collecting deployment parameters...', 'pending');
        
        const params = collectDeploymentParameters();
        console.log('Deployment parameters:', params);
        
        // Validate parameters
        if (params.minDelay <= 0) {
            throw new Error('Minimum delay must be greater than 0');
        }
        
        showDeploymentStatus('Preparing contract deployment...', 'pending');
        
        // For now, show what would be deployed since we don't have bytecode
        // In a real implementation, you would deploy here
        await simulateDeployment(params);
        
    } catch (error) {
        console.error('Deployment error:', error);
        showDeploymentError(error.message || 'Deployment failed');
    } finally {
        deploymentInProgress = false;
        const deployButton = document.getElementById('deployTimelockVault');
        deployButton.disabled = false;
        deployButton.textContent = 'Deploy TimelockVault';
    }
}

// Simulate deployment (replace with actual deployment when bytecode is available)
async function simulateDeployment(params) {
    showDeploymentStatus('Simulating deployment... (bytecode not available)', 'pending');
    
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Generate a simulated contract address
    const simulatedAddress = ethers.utils.getAddress(ethers.utils.hexlify(ethers.utils.randomBytes(20)));
    
    showDeploymentStatus(`
        🎉 Deployment Simulation Complete!
        
        Contract Address: ${simulatedAddress}
        Min Delay: ${params.minDelay} seconds
        Proposers: ${params.proposers.length} addresses
        Executors: ${params.executors.length === 1 && params.executors[0] === '0x0000000000000000000000000000000000000000' ? 'Anyone can execute' : params.executors.length + ' addresses'}
        Cancellers: ${params.cancellers.length} addresses
        Recovery Triggerers: ${params.recoveryTriggerers.length} addresses
        Recoverers: ${params.recoverers.length} addresses
        
        Note: This is a simulation. To enable actual deployment, provide the TimelockVault bytecode.
    `, 'success');
    
    // Show option to connect to simulated contract
    setTimeout(() => {
        if (confirm(`Connect to simulated contract at ${simulatedAddress}?`)) {
            // Update config and connect
            window.CONFIG.CONTRACT_ADDRESS = simulatedAddress;
            document.getElementById('contractAddress').textContent = simulatedAddress;
            
            // Switch to dashboard
            window.switchMainTab('dashboard');
        }
    }, 1000);
}

// Utility functions
function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function showDeploymentStatus(message, type) {
    const statusElement = document.getElementById('deploymentStatus');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `deployment-status ${type}`;
        statusElement.style.display = 'block';
    }
}

function showDeploymentError(message) {
    showDeploymentStatus(message, 'error');
}

// Make functions available globally
window.removeRoleAddress = removeRoleAddress;
window.deployTimelockVault = deployTimelockVault;
window.updateDeploymentButtonState = updateDeploymentButtonState;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure other scripts are loaded
    setTimeout(initializeDeploymentTab, 100);
});
