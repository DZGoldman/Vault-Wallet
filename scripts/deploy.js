const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying TimelockVault with the account:", deployer.address);

  // Configuration
  const minDelay = 86400; // 24 hours in seconds
  const proposers = [deployer.address]; // Initial proposer
  const executors = []; // Empty array means anyone can execute
  const recoveryTriggerer = deployer.address; // Initial recovery triggerer
  const recoverer = deployer.address; // Initial recoverer

  console.log("Configuration:");
  console.log("- Min Delay:", minDelay, "seconds (24 hours)");
  console.log("- Proposers:", proposers);
  console.log("- Executors:", executors.length === 0 ? "Anyone" : executors);
  console.log("- Recovery Triggerer:", recoveryTriggerer);
  console.log("- Recoverer:", recoverer);

  // Deploy the contract
  const TimelockVault = await ethers.getContractFactory("TimelockVault");
  const timelockVault = await TimelockVault.deploy(
    minDelay,
    proposers,
    executors,
    recoveryTriggerer,
    recoverer
  );

  await timelockVault.waitForDeployment();

  console.log("TimelockVault deployed to:", await timelockVault.getAddress());
  console.log("Recovery mode:", await timelockVault.recoveryMode());
  
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
  console.log("- Recovery Triggerer:", recoveryTriggerer);
  console.log("- Recoverer:", recoverer);
  console.log("- Can Cancel Operations:", [...proposers, recoveryTriggerer]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  }); 