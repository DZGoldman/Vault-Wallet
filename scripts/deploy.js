const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying TimelockVault with the account:", deployer.address);

  // Configuration
  const minDelay = 86400; // 24 hours in seconds
  const proposers = [deployer.address]; // Initial proposer
  const executors = []; // Empty array means anyone can execute
  const recoveryTriggerers = [deployer.address]; // Initial recovery triggerer
  const recoverers = [deployer.address]; // Initial recoverer

  console.log("Configuration:");
  console.log("- Min Delay:", minDelay, "seconds (24 hours)");
  console.log("- Proposers:", proposers);
  console.log("- Executors:", executors.length === 0 ? "Anyone" : executors);
  console.log("- Recovery Triggerers:", recoveryTriggerers);
  console.log("- Recoverers:", recoverers);

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

  console.log("TimelockVault deployed to:", await timelockVault.getAddress());
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