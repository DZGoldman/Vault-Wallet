# TimelockVault

A Solidity smart contract that implements a timelock vault with recovery mode functionality. This contract inherits from OpenZeppelin's `TimelockController` and adds advanced recovery mechanisms for enhanced security.

## Features

### Core Timelock Functionality
- **Delayed Operations**: All operations must wait for a minimum delay before execution
- **Proposer Role**: Only designated proposers can schedule operations
- **Universal Execution**: Anyone can execute operations once the delay period has passed
- **Operation Cancellation**: Operations can be cancelled by proposers or recovery triggerers

### Recovery Mode System
- **Recovery Trigger**: A designated role can trigger recovery mode, which halts all operations
- **Recovery Mode State**: When active, no operations can be scheduled or executed
- **Recovery Exit**: A recoverer role can exit recovery mode and reset system roles
- **Role Reset**: During recovery exit, new proposer and recovery triggerer roles can be assigned

## Contract Architecture

### Roles
- **PROPOSER_ROLE**: Can schedule operations and cancel them
- **EXECUTOR_ROLE**: Can execute operations (empty array means anyone can execute)
- **RECOVERY_TRIGGER_ROLE**: Can trigger recovery mode and cancel operations
- **RECOVERER_ROLE**: Can exit recovery mode and reset roles
- **ADMIN_ROLE**: Can manage all roles

### State Variables
- `recoveryMode`: Boolean indicating if the system is in recovery mode
- `minDelay`: Minimum delay for operations (inherited from TimelockController)

## Installation

1. Install Node.js and npm

2. Clone and setup:
```bash
git clone <repository-url>
cd timelock-vault
npm install
```

## Development

### Compile contracts:
```bash
npm run compile
```

### Run tests:
```bash
npm test
```

### Run tests with verbose output:
```bash
npx hardhat test --verbose
```

### Run specific test:
```bash
npx hardhat test --grep "Deployment"
```

### Deploy (requires local network):
```bash
npm run deploy
```

## Environment Variables

Create a `.env` file with the following variables for deployment:

```env
PRIVATE_KEY=your_private_key_here
PROPOSER_ADDRESS=0x...
ADMIN_ADDRESS=0x...
RECOVERY_TRIGGERER_ADDRESS=0x...
RECOVERER_ADDRESS=0x...
```

## Usage

### Deployment

```javascript
// Deploy with Hardhat
npx hardhat run scripts/deploy.js --network localhost
```

### Scheduling Operations

```solidity
// Schedule a single operation
await timelockVault.connect(proposer).schedule(
    targetAddress,    // Contract to call
    value,           // ETH value to send
    data,            // Function call data
    predecessor,     // Previous operation (or 0x0)
    salt,           // Unique identifier
    delay           // Delay period
);

// Schedule batch operations
await timelockVault.connect(proposer).scheduleBatch(
    [target1, target2],     // Array of target addresses
    [value1, value2],       // Array of ETH values
    [data1, data2],         // Array of function call data
    predecessor,            // Previous operation (or 0x0)
    salt,                  // Unique identifier
    delay                  // Delay period
);
```

### Executing Operations

```solidity
// Execute a single operation
await timelockVault.connect(anyone).execute(
    targetAddress,
    value,
    data,
    predecessor,
    salt
);

// Execute batch operations
await timelockVault.connect(anyone).executeBatch(
    [target1, target2],
    [value1, value2],
    [data1, data2],
    predecessor,
    salt
);
```

### Recovery Mode Operations

```solidity
// Trigger recovery mode
await timelockVault.connect(recoveryTriggerer).triggerRecoveryMode();

// Exit recovery mode and reset roles
await timelockVault.connect(recoverer).exitRecoveryMode(
    newProposerAddress,
    newRecoveryTriggererAddress
);
```

### Cancelling Operations

```solidity
// Cancel an operation (proposer or recovery triggerer only)
await timelockVault.connect(proposer).cancel(operationId);
```

## Security Features

### Recovery Mode Protection
- When recovery mode is active, all scheduling and execution is blocked
- Only the recoverer can exit recovery mode
- Role reset during recovery exit ensures clean state

### Role-Based Access Control
- Clear separation of responsibilities between roles
- Recovery triggerer also has proposer role for cancellation purposes
- Admin role can manage all roles

### Reentrancy Protection
- `exitRecoveryMode` function is protected with `nonReentrant` modifier
- Prevents potential reentrancy attacks during role reset

## Events

- `RecoveryModeTriggered(address indexed triggerer)`: Emitted when recovery mode is triggered
- `RecoveryModeExited(address indexed recoverer, address indexed newProposer, address indexed newTriggerer)`: Emitted when recovery mode is exited
- `OperationCancelled(bytes32 indexed id, address indexed canceller)`: Emitted when an operation is cancelled

## Testing

The test suite covers:
- Deployment and initialization
- Recovery mode functionality
- Operation scheduling and execution
- Operation cancellation
- Role management
- Batch operations
- Edge cases and security scenarios

## License

MIT License - see LICENSE file for details.

## Features

### Core Timelock Functionality
- **Delayed Operations**: All operations must wait for a minimum delay before execution
- **Proposer Role**: Only designated proposers can schedule operations
- **Universal Execution**: Anyone can execute operations once the delay period has passed
- **Operation Cancellation**: Operations can be cancelled by proposers or recovery triggerers

### Recovery Mode System
- **Recovery Trigger**: A designated role can trigger recovery mode, which halts all operations
- **Recovery Mode State**: When active, no operations can be scheduled or executed
- **Recovery Exit**: A recoverer role can exit recovery mode and reset system roles
- **Role Reset**: During recovery exit, new proposer and recovery triggerer roles can be assigned

## Contract Architecture

### Roles
- **PROPOSER_ROLE**: Can schedule operations and cancel them
- **EXECUTOR_ROLE**: Can execute operations (empty array means anyone can execute)
- **RECOVERY_TRIGGER_ROLE**: Can trigger recovery mode and cancel operations
- **RECOVERER_ROLE**: Can exit recovery mode and reset roles
- **ADMIN_ROLE**: Can manage all roles

### State Variables
- `recoveryMode`: Boolean indicating if the system is in recovery mode
- `minDelay`: Minimum delay for operations (inherited from TimelockController)

## Usage

### Deployment

```javascript
const TimelockVault = await ethers.getContractFactory("TimelockVault");
const timelockVault = await TimelockVault.deploy(
    minDelay,           // e.g., 86400 (24 hours)
    [proposerAddress],  // Array of proposer addresses
    [],                 // Empty array for universal execution
    adminAddress,       // Admin address
    recoveryTriggerer,  // Recovery triggerer address
    recovererAddress    // Recoverer address
);
```

### Scheduling Operations

```javascript
// Schedule a single operation
await timelockVault.connect(proposer).schedule(
    targetAddress,    // Contract to call
    value,           // ETH value to send
    data,            // Function call data
    predecessor,     // Previous operation (or 0x0)
    salt,           // Unique identifier
    delay           // Delay period
);

// Schedule batch operations
await timelockVault.connect(proposer).scheduleBatch(
    [target1, target2],     // Array of target addresses
    [value1, value2],       // Array of ETH values
    [data1, data2],         // Array of function call data
    predecessor,            // Previous operation (or 0x0)
    salt,                  // Unique identifier
    delay                  // Delay period
);
```

### Executing Operations

```javascript
// Execute a single operation
await timelockVault.connect(anyone).execute(
    targetAddress,
    value,
    data,
    predecessor,
    salt
);

// Execute batch operations
await timelockVault.connect(anyone).executeBatch(
    [target1, target2],
    [value1, value2],
    [data1, data2],
    predecessor,
    salt
);
```

### Recovery Mode Operations

```javascript
// Trigger recovery mode
await timelockVault.connect(recoveryTriggerer).triggerRecoveryMode();

// Exit recovery mode and reset roles
await timelockVault.connect(recoverer).exitRecoveryMode(
    newProposerAddress,
    newRecoveryTriggererAddress
);
```

### Cancelling Operations

```javascript
// Cancel an operation (proposer or recovery triggerer only)
await timelockVault.connect(proposer).cancel(operationId);
```

## Security Features

### Recovery Mode Protection
- When recovery mode is active, all scheduling and execution is blocked
- Only the recoverer can exit recovery mode
- Role reset during recovery exit ensures clean state

### Role-Based Access Control
- Clear separation of responsibilities between roles
- Recovery triggerer also has proposer role for cancellation purposes
- Admin role can manage all roles

### Reentrancy Protection
- `exitRecoveryMode` function is protected with `nonReentrant` modifier
- Prevents potential reentrancy attacks during role reset

## Events

- `RecoveryModeTriggered(address indexed triggerer)`: Emitted when recovery mode is triggered
- `RecoveryModeExited(address indexed recoverer, address indexed newProposer, address indexed newTriggerer)`: Emitted when recovery mode is exited
- `OperationCancelled(bytes32 indexed id, address indexed canceller)`: Emitted when an operation is cancelled

## Testing

Run the test suite:

```bash
npm test
```

The test suite covers:
- Deployment and initialization
- Recovery mode functionality
- Operation scheduling and execution
- Operation cancellation
- Role management
- Batch operations
- Edge cases and security scenarios

## Installation

1. Install dependencies:
```bash
npm install
```

2. Compile contracts:
```bash
npm run compile
```

3. Run tests:
```bash
npm test
```

4. Deploy (requires local network):
```bash
npm run deploy
```

## Contract Addresses

After deployment, the contract will output:
- Contract address
- Role hashes for reference
- Initial state information

## License

MIT License - see LICENSE file for details. 