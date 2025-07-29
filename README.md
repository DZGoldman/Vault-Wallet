# TimelockVault

A timelock vault with recovery mode functionality, built on top of OpenZeppelin's TimelockController.

## Features

- **Timelock Operations**: Schedule and execute operations with configurable delays
- **Recovery Mode**: Emergency mode that prevents operations and switches role control
- **Epoch-based Global Cancellation**: Cancel all pending operations from previous epochs
- **Role-based Access Control**: Separate roles for proposers, executors, recovery triggerers, and recoverers

## Architecture

This is a hybrid project using both **Foundry** and **Hardhat**:
- **Foundry**: For Solidity testing (`forge test`)
- **Hardhat**: For JavaScript deployment scripts (`npx hardhat run`)

## Installation

```shell
# Install Foundry dependencies
forge install

# Install Node.js dependencies  
npm install
```

## Development

### Build

```shell
# Foundry build
forge build

# Hardhat build (needed for deployment)
npx hardhat compile
```

### Test

```shell
forge test
```

### Format

```shell
forge fmt
```

### Gas Snapshots

```shell
forge snapshot
```

## Deployment

**Note**: You must compile with Hardhat before deployment: `npx hardhat compile`

### Basic Deployment

```shell
# Deploy with defaults (deployer has all roles, 24h delay)
npx hardhat run scripts/deploy.js --network localhost
```

### Custom Deployment Options

The deployment script supports command line arguments to customize the configuration:

```shell
# Custom delay (in seconds)
npx hardhat run scripts/deploy.js --network localhost --delay 172800

# Multiple proposers
npx hardhat run scripts/deploy.js --network localhost --proposers 0x123...,0x456...

# Specific executors (empty = anyone can execute)
npx hardhat run scripts/deploy.js --network localhost --executors 0x789...

# Complete custom setup
npx hardhat run scripts/deploy.js --network localhost \
  --delay 7200 \
  --proposers 0x123...,0x456... \
  --executors 0x789... \
  --recoveryTriggerers 0xabc... \
  --recoverers 0xdef...

# Show help
npx hardhat run scripts/deploy.js --network localhost --help
```

**Options:**
- `--delay <seconds>` - Minimum delay in seconds (default: 86400 = 24 hours)
- `--proposers <addr1,addr2,...>` - Comma-separated proposer addresses (default: deployer)
- `--executors <addr1,addr2,...>` - Comma-separated executor addresses (default: empty = anyone)
- `--recoveryTriggerers <addr1,addr2,...>` - Recovery triggerer addresses (default: deployer)
- `--recoverers <addr1,addr2,...>` - Recoverer addresses (default: deployer)

### Local Development (Anvil - Recommended)

```shell
# Start Anvil in one terminal
anvil --port 8546 --block-time 5

# Deploy in another terminal
npx hardhat run scripts/deploy.js --network localhost
```

### Production Networks

```shell
npx hardhat run scripts/deploy.js --network <network_name>
```

## Project Structure

```
├── src/                    # Solidity contracts
│   └── TimelockVault.sol
├── test/                   # Foundry tests
│   └── TimelockVault.t.sol
├── scripts/                # Hardhat deployment scripts
│   └── deploy.js
├── foundry.toml           # Foundry configuration
├── hardhat.config.js      # Hardhat configuration
└── package.json           # Node.js dependencies
```

## Key Contracts

### TimelockVault

Main contract extending OpenZeppelin's TimelockController with:
- Recovery mode functionality
- Epoch-based global operation cancellation
- Role admin switching during recovery

## Documentation

- [Foundry Book](https://book.getfoundry.sh/)
- [Hardhat Documentation](https://hardhat.org/docs)
- [OpenZeppelin TimelockController](https://docs.openzeppelin.com/contracts/4.x/api/governance#TimelockController)
