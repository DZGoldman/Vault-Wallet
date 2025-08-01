// views.js - Display functions for operations and transactions

// Helper function to format addresses for display
function formatAddress(address) {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Analyze recovery transaction type
function analyzeRecoveryTransactionType(operation) {
    const call = operation.calls[0];
    
    // Check for role management (grantRole/revokeRole)
    if (call.data && call.data.length >= 10) {
        const methodSignature = call.data.slice(0, 10);
        const grantRoleSignature = '0x2f2ff15d'; // grantRole(bytes32,address)
        const revokeRoleSignature = '0xd547741f'; // revokeRole(bytes32,address)
        
        if (methodSignature.toLowerCase() === grantRoleSignature.toLowerCase()) {
            return {
                type: 'role_management',
                displayName: 'Role Grant',
                action: 'grant'
            };
        } else if (methodSignature.toLowerCase() === revokeRoleSignature.toLowerCase()) {
            return {
                type: 'role_management',
                displayName: 'Role Revoke',
                action: 'revoke'
            };
        }
    }
    
    // Check for ETH transfer (no data or empty data)
    if (!call.data || call.data === '0x' || call.data === '0x00') {
        const valueEth = ethers.utils.formatEther(call.value);
        return {
            type: 'eth_transfer',
            displayName: 'Recovery ETH Transfer',
            to: call.target,
            amount: valueEth
        };
    }
    
    // Check for ERC20 token transfer
    if (call.data.length >= 10) {
        const methodSignature = call.data.slice(0, 10);
        const transferSignature = '0xa9059cbb'; // transfer(address,uint256)
        
        if (methodSignature.toLowerCase() === transferSignature.toLowerCase()) {
            return {
                type: 'token_transfer',
                displayName: 'Recovery Token Transfer'
            };
        }
    }
    
    // Default: generic recovery operation
    return {
        type: 'generic',
        displayName: 'Recovery Operation'
    };
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
                    const tokenInfo = window.SUPPORTED_TOKENS.find(token => 
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

// Create role management display for recovery operations
function createRoleManagementDisplay(transactionInfo, operation) {
    return `
        <div class="operation-details transaction-display role-management">
            <div class="transaction-summary">
                <div class="transaction-icon">${transactionInfo.action === 'grant' ? '➕' : '➖'}</div>
                <div class="transaction-info">
                    <div class="transaction-title">${transactionInfo.action === 'grant' ? 'Grant' : 'Revoke'} Role</div>
                    <div class="transaction-subtitle">via recoveryExecute</div>
                </div>
            </div>
            
            <div class="transaction-details">
                <div class="detail-row">
                    <span class="detail-label">Target Contract</span>
                    <span class="detail-value address-value">${operation.target}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Recoverer</span>
                    <span class="detail-value address-value">${operation.executor}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Transaction Hash</span>
                    <span class="detail-value address-value">${operation.transactionHash}</span>
                </div>
            </div>
        </div>
    `;
}

// Create recovery ETH transfer display
function createRecoveryETHTransferDisplay(transactionInfo, operation) {
    return `
        <div class="operation-details transaction-display recovery-eth-transfer">
            <div class="transaction-summary">
                <div class="transaction-icon">🚨💰</div>
                <div class="transaction-info">
                    <div class="transaction-title">Recovery ETH Transfer: ${transactionInfo.amount} ETH</div>
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
                    <span class="detail-label">Recoverer</span>
                    <span class="detail-value address-value">${operation.executor}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Transaction Hash</span>
                    <span class="detail-value address-value">${operation.transactionHash}</span>
                </div>
            </div>
        </div>
    `;
}

// Create recovery token transfer display
function createRecoveryTokenTransferDisplay(transactionInfo, operation) {
    return `
        <div class="operation-details transaction-display recovery-token-transfer">
            <div class="transaction-summary">
                <div class="transaction-icon">🚨🪙</div>
                <div class="transaction-info">
                    <div class="transaction-title">Recovery Token Transfer</div>
                    <div class="transaction-subtitle">to ${formatAddress(operation.calls[0].target)}</div>
                </div>
            </div>
            
            <div class="transaction-details">
                <div class="detail-row">
                    <span class="detail-label">Token Contract</span>
                    <span class="detail-value address-value">${operation.calls[0].target}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Recoverer</span>
                    <span class="detail-value address-value">${operation.executor}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Transaction Hash</span>
                    <span class="detail-value address-value">${operation.transactionHash}</span>
                </div>
            </div>
        </div>
    `;
}

// Create recovery generic display
function createRecoveryGenericDisplay(operation) {
    return `
        <div class="operation-details transaction-display recovery-generic">
            <div class="transaction-summary">
                <div class="transaction-icon">🚨⚙️</div>
                <div class="transaction-info">
                    <div class="transaction-title">Recovery Operation</div>
                    <div class="transaction-subtitle">Smart contract call</div>
                </div>
            </div>
            
            <div class="transaction-details">
                <div class="detail-row">
                    <span class="detail-label">Target</span>
                    <span class="detail-value address-value">${operation.target}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Value (ETH)</span>
                    <span class="detail-value">${ethers.utils.formatEther(operation.value)}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Recoverer</span>
                    <span class="detail-value address-value">${operation.executor}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Transaction Hash</span>
                    <span class="detail-value address-value">${operation.transactionHash}</span>
                </div>
            </div>
        </div>
    `;
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
