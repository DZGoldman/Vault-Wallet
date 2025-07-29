const { ethers } = require("hardhat");

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    delay: null,
    proposers: null,
    executors: null,
    recoveryTriggerers: null,
    recoverers: null,
    help: false
  };

  // First check command line arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--delay') {
      options.delay = parseInt(args[++i]);
    } else if (arg === '--proposers') {
      options.proposers = args[++i].split(',').map(addr => addr.trim());
    } else if (arg === '--executors') {
      options.executors = args[++i].split(',').map(addr => addr.trim());
    } else if (arg === '--recovery-triggerers') {
      options.recoveryTriggerers = args[++i].split(',').map(addr => addr.trim());
    } else if (arg === '--recoverers') {
      options.recoverers = args[++i].split(',').map(addr => addr.trim());
    }
  }

  // Then check environment variables as fallback
  if (options.delay === null && process.env.DELAY) {
    options.delay = parseInt(process.env.DELAY);
  }
  if (options.proposers === null && process.env.PROPOSERS) {
    options.proposers = process.env.PROPOSERS.split(',').map(addr => addr.trim());
  }
  if (options.executors === null && process.env.EXECUTORS) {
    options.executors = process.env.EXECUTORS.split(',').map(addr => addr.trim());
  }
  if (options.recoveryTriggerers === null && process.env.RECOVERY_TRIGGERERS) {
    options.recoveryTriggerers = process.env.RECOVERY_TRIGGERERS.split(',').map(addr => addr.trim());
  }
  if (options.recoverers === null && process.env.RECOVERERS) {
    options.recoverers = process.env.RECOVERERS.split(',').map(addr => addr.trim());
  }

  return options;
}

async function main() {
  const options = parseArgs();

  // Show help if requested (before initializing ethers)
  if (options.help) {
    showUsage();
    return;
  }

  const [deployer] = await ethers.getSigners();

  console.log("Deploying TimelockVault with the account:", deployer.address);
  
  if (Object.keys(options).length > 0) {
    console.log("Command line options:", options);
  }

  // Configuration with command line overrides
  const minDelay = options.delay ? parseInt(options.delay) : 86400; // 24 hours in seconds
  const proposers = options.proposers && options.proposers.length > 0 ? options.proposers : [deployer.address];
  const executors = options.executors || ["0x0000000000000000000000000000000000000000"]; // Empty array means anyone can execute
  const recoveryTriggerers = options.recoveryTriggerers && options.recoveryTriggerers.length > 0 ? options.recoveryTriggerers : [deployer.address];
  const recoverers = options.recoverers && options.recoverers.length > 0 ? options.recoverers : [deployer.address];

  console.log("Configuration:");
  console.log("- Min Delay:", minDelay, "seconds (" + (minDelay / 3600) + " hours)");
  console.log("- Proposers:", proposers);
  console.log("- Executors:", executors.length === 0 ? "Anyone" : executors);
  console.log("- Recovery Triggerers:", recoveryTriggerers);
  console.log("- Recoverers:", recoverers);
  
  // Validation
  if (minDelay < 0) {
    throw new Error("Min delay must be non-negative");
  }
  if (proposers.length === 0) {
    throw new Error("Must have at least one proposer");
  }
  if (recoveryTriggerers.length === 0) {
    throw new Error("Must have at least one recovery triggerer");
  }
  if (recoverers.length === 0) {
    throw new Error("Must have at least one recoverer");
  }

  // Deploy the contract
  const TimelockVault = await ethers.getContractFactory("TimelockVault");
  const timelockVault = await TimelockVault.deploy(
    minDelay,
    proposers,
    executors,
    recoveryTriggerers,
    recoverers
  );

  await timelockVault.waitForDeployment();
  console.log('-------------------------------');
  console.log("TimelockVault deployed to:", await timelockVault.getAddress());
  console.log('-------------------------------');

  console.log("Recovery mode:", await timelockVault.recoveryMode());
  console.log("Current recovery epoch:", await timelockVault.currentRecoveryEpoch());
  
  // Log role hashes for reference
  console.log("\nRole hashes:");
  console.log("- PROPOSER_ROLE:", await timelockVault.PROPOSER_ROLE());
  console.log("- EXECUTOR_ROLE:", await timelockVault.EXECUTOR_ROLE());
  console.log("- CANCELLER_ROLE:", await timelockVault.CANCELLER_ROLE());
  console.log("- RECOVERY_TRIGGER_ROLE:", await timelockVault.RECOVERY_TRIGGER_ROLE());
  console.log("- RECOVERER_ROLE:", await timelockVault.RECOVERER_ROLE());
  
  // Log role assignments
  console.log("\nRole assignments:");
  console.log("- Proposers:", proposers);
  console.log("- Recovery Triggerers:", recoveryTriggerers);
  console.log("- Recoverers:", recoverers);
  
  // Verify role assignments
  console.log("\nVerifying role assignments:");
  for (const proposer of proposers) {
    console.log(`- ${proposer} has PROPOSER_ROLE:`, await timelockVault.hasRole(await timelockVault.PROPOSER_ROLE(), proposer));
    console.log(`- ${proposer} has CANCELLER_ROLE:`, await timelockVault.hasRole(await timelockVault.CANCELLER_ROLE(), proposer));
  }
  for (const triggerer of recoveryTriggerers) {
    console.log(`- ${triggerer} has RECOVERY_TRIGGER_ROLE:`, await timelockVault.hasRole(await timelockVault.RECOVERY_TRIGGER_ROLE(), triggerer));
  }
  for (const recoverer of recoverers) {
    console.log(`- ${recoverer} has RECOVERER_ROLE:`, await timelockVault.hasRole(await timelockVault.RECOVERER_ROLE(), recoverer));
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

// Usage information
function showUsage() {
  console.log(`
Usage: npx hardhat run scripts/deploy.js --network <network> [options]

Options:
  --delay <seconds>              Minimum delay in seconds (default: 86400 = 24 hours)
  --proposers <addr1,addr2,...>  Comma-separated proposer addresses (default: deployer)
  --executors <addr1,addr2,...>  Comma-separated executor addresses (default: empty = anyone)
  --recovery-triggerers <addr1,addr2,...>  Comma-separated recovery triggerer addresses (default: deployer)
  --recoverers <addr1,addr2,...> Comma-separated recoverer addresses (default: deployer)
  --help                         Show this help message

Environment Variables (alternative to command line options):
  DELAY                          Minimum delay in seconds
  PROPOSERS                      Comma-separated proposer addresses
  EXECUTORS                      Comma-separated executor addresses
  RECOVERY_TRIGGERERS            Comma-separated recovery triggerer addresses
  RECOVERERS                     Comma-separated recoverer addresses

Examples:
  # Deploy with defaults (deployer has all roles)
  npx hardhat run scripts/deploy.js --network localhost

  # Deploy with custom delay using environment variable
  DELAY=7200 npx hardhat run scripts/deploy.js --network localhost

  # Deploy with environment variables for complex configuration
  DELAY=3600 PROPOSERS=0x123...,0x456... RECOVERY_TRIGGERERS=0x789... npx hardhat run scripts/deploy.js --network localhost

  # Deploy with command line options (if your shell supports it)
  npx hardhat run scripts/deploy.js --network localhost --delay 172800 --proposers 0x123...,0x456...
`);
} 