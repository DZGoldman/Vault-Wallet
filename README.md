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

### Local Development (Hardhat Network)

```shell
npx hardhat run scripts/deploy.js --network hardhat
```

### Local Development (Anvil - Recommended)

```shell
# Start Anvil in one terminal
anvil --port 8545 --chain-id 1337

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
