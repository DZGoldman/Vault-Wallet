const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TimelockVault", function () {
  let timelockVault;
  let owner, proposer, executor, recoveryTriggerer, recoverer, user1, user2;
  let minDelay = 86400; // 24 hours

  beforeEach(async function () {
    [owner, proposer, executor, recoveryTriggerer, recoverer, user1, user2] = await ethers.getSigners();

    const TimelockVault = await ethers.getContractFactory("TimelockVault");
    timelockVault = await TimelockVault.deploy(
      minDelay,
      [proposer.address],
      [], // Empty array means anyone can execute
      owner.address,
      recoveryTriggerer.address,
      recoverer.address
    );
  });

  describe("Deployment", function () {
    it("Should deploy with correct initial state", async function () {
      expect(await timelockVault.recoveryMode()).to.equal(false);
      expect(await timelockVault.getMinDelay()).to.equal(minDelay);
      
      // Check roles
      expect(await timelockVault.hasRole(await timelockVault.PROPOSER_ROLE(), proposer.address)).to.equal(true);
      expect(await timelockVault.hasRole(await timelockVault.RECOVERY_TRIGGER_ROLE(), recoveryTriggerer.address)).to.equal(true);
      expect(await timelockVault.hasRole(await timelockVault.RECOVERER_ROLE(), recoverer.address)).to.equal(true);
      expect(await timelockVault.hasRole(await timelockVault.CANCELLER_ROLE(), proposer.address)).to.equal(true);
      expect(await timelockVault.hasRole(await timelockVault.CANCELLER_ROLE(), recoveryTriggerer.address)).to.equal(true);
    });
  });

  describe("Recovery Mode", function () {
    it("Should allow recovery triggerer to trigger recovery mode", async function () {
      await expect(timelockVault.connect(recoveryTriggerer).triggerRecoveryMode())
        .to.emit(timelockVault, "RecoveryModeTriggered")
        .withArgs(recoveryTriggerer.address);
      
      expect(await timelockVault.recoveryMode()).to.equal(true);
    });

    it("Should not allow non-recovery triggerer to trigger recovery mode", async function () {
      await expect(timelockVault.connect(user1).triggerRecoveryMode())
        .to.be.reverted;
    });

    it("Should not allow triggering recovery mode when already in recovery mode", async function () {
      await timelockVault.connect(recoveryTriggerer).triggerRecoveryMode();
      
      await expect(timelockVault.connect(recoveryTriggerer).triggerRecoveryMode())
        .to.be.revertedWith("TimelockVault: Cannot perform operation in recovery mode");
    });

    it("Should allow recoverer to exit recovery mode and reset roles", async function () {
      await timelockVault.connect(recoveryTriggerer).triggerRecoveryMode();
      
      await expect(timelockVault.connect(recoverer).exitRecoveryMode(user1.address, user2.address))
        .to.emit(timelockVault, "RecoveryModeExited")
        .withArgs(recoverer.address, user1.address, user2.address);
      
      expect(await timelockVault.recoveryMode()).to.equal(false);
      
      // Check that roles have been reset
      expect(await timelockVault.hasRole(await timelockVault.PROPOSER_ROLE(), user1.address)).to.equal(true);
      expect(await timelockVault.hasRole(await timelockVault.RECOVERY_TRIGGER_ROLE(), user2.address)).to.equal(true);
      expect(await timelockVault.hasRole(await timelockVault.CANCELLER_ROLE(), user1.address)).to.equal(true);
      expect(await timelockVault.hasRole(await timelockVault.CANCELLER_ROLE(), user2.address)).to.equal(true);
      
      // Check that old roles are revoked
      expect(await timelockVault.hasRole(await timelockVault.PROPOSER_ROLE(), proposer.address)).to.equal(false);
      expect(await timelockVault.hasRole(await timelockVault.RECOVERY_TRIGGER_ROLE(), recoveryTriggerer.address)).to.equal(false);
    });

    it("Should not allow non-recoverer to exit recovery mode", async function () {
      await timelockVault.connect(recoveryTriggerer).triggerRecoveryMode();
      
      await expect(timelockVault.connect(user1).exitRecoveryMode(user1.address, user2.address))
        .to.be.reverted;
    });

    it("Should not allow exiting recovery mode when not in recovery mode", async function () {
      await expect(timelockVault.connect(recoverer).exitRecoveryMode(user1.address, user2.address))
        .to.be.revertedWith("TimelockVault: Not in recovery mode");
    });

    it("Should not allow setting zero addresses when exiting recovery mode", async function () {
      await timelockVault.connect(recoveryTriggerer).triggerRecoveryMode();
      
      await expect(timelockVault.connect(recoverer).exitRecoveryMode(ethers.ZeroAddress, user2.address))
        .to.be.revertedWith("TimelockVault: Invalid new proposer");
      
      await expect(timelockVault.connect(recoverer).exitRecoveryMode(user1.address, ethers.ZeroAddress))
        .to.be.revertedWith("TimelockVault: Invalid new triggerer");
    });
  });

  describe("Scheduling Operations", function () {
    it("Should allow proposer to schedule operations when not in recovery mode", async function () {
      const target = user1.address;
      const value = 0;
      const data = "0x";
      const predecessor = ethers.ZeroHash;
      const salt = ethers.id("test");
      const delay = minDelay;

      await expect(timelockVault.connect(proposer).schedule(target, value, data, predecessor, salt, delay))
        .to.not.be.reverted;
    });

    it("Should not allow scheduling operations in recovery mode", async function () {
      await timelockVault.connect(recoveryTriggerer).triggerRecoveryMode();
      
      const target = user1.address;
      const value = 0;
      const data = "0x";
      const predecessor = ethers.ZeroHash;
      const salt = ethers.id("test");
      const delay = minDelay;

      await expect(timelockVault.connect(proposer).schedule(target, value, data, predecessor, salt, delay))
        .to.be.revertedWith("TimelockVault: Cannot perform operation in recovery mode");
    });

    it("Should not allow non-proposer to schedule operations", async function () {
      const target = user1.address;
      const value = 0;
      const data = "0x";
      const predecessor = ethers.ZeroHash;
      const salt = ethers.id("test");
      const delay = minDelay;

      await expect(timelockVault.connect(user1).schedule(target, value, data, predecessor, salt, delay))
        .to.be.reverted;
    });
  });

  describe("Executing Operations", function () {
    it("Should allow anyone to execute operations when not in recovery mode", async function () {
      const target = user1.address;
      const value = 0;
      const data = "0x";
      const predecessor = ethers.ZeroHash;
      const salt = ethers.id("test");
      const delay = minDelay;

      await timelockVault.connect(proposer).schedule(target, value, data, predecessor, salt, delay);
      
      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [minDelay + 1]);
      await ethers.provider.send("evm_mine");

      await expect(timelockVault.connect(user1).execute(target, value, data, predecessor, salt))
        .to.be.reverted;
    });

    it("Should not allow executing operations in recovery mode", async function () {
      const target = user1.address;
      const value = 0;
      const data = "0x";
      const predecessor = ethers.ZeroHash;
      const salt = ethers.id("test");
      const delay = minDelay;

      await timelockVault.connect(proposer).schedule(target, value, data, predecessor, salt, delay);
      
      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [minDelay + 1]);
      await ethers.provider.send("evm_mine");

      await timelockVault.connect(recoveryTriggerer).triggerRecoveryMode();

      await expect(timelockVault.connect(user1).execute(target, value, data, predecessor, salt))
        .to.be.revertedWith("TimelockVault: Cannot perform operation in recovery mode");
    });
  });

  describe("Cancelling Operations", function () {
    it("Should allow proposer to cancel operations", async function () {
      const target = user1.address;
      const value = 0;
      const data = "0x";
      const predecessor = ethers.ZeroHash;
      const salt = ethers.id("test");
      const delay = minDelay;

      await timelockVault.connect(proposer).schedule(target, value, data, predecessor, salt, delay);
      
      const operationId = await timelockVault.hashOperation(target, value, data, predecessor, salt);
      
      await expect(timelockVault.connect(proposer).cancel(operationId))
        .to.emit(timelockVault, "OperationCancelled")
        .withArgs(operationId, proposer.address);
    });

    it("Should allow recovery triggerer to cancel operations", async function () {
      const target = user1.address;
      const value = 0;
      const data = "0x";
      const predecessor = ethers.ZeroHash;
      const salt = ethers.id("test");
      const delay = minDelay;

      await timelockVault.connect(proposer).schedule(target, value, data, predecessor, salt, delay);
      
      const operationId = await timelockVault.hashOperation(target, value, data, predecessor, salt);
      
      await expect(timelockVault.connect(recoveryTriggerer).cancel(operationId))
        .to.emit(timelockVault, "OperationCancelled")
        .withArgs(operationId, recoveryTriggerer.address);
    });

    it("Should not allow non-proposer or non-recovery triggerer to cancel operations", async function () {
      const target = user1.address;
      const value = 0;
      const data = "0x";
      const predecessor = ethers.ZeroHash;
      const salt = ethers.id("test");
      const delay = minDelay;

      await timelockVault.connect(proposer).schedule(target, value, data, predecessor, salt, delay);
      
      const operationId = await timelockVault.hashOperation(target, value, data, predecessor, salt);
      
      await expect(timelockVault.connect(user1).cancel(operationId))
        .to.be.reverted;
    });
  });

  describe("Operation Status Checks", function () {
    it("Should correctly report operation status when not in recovery mode", async function () {
      const target = user1.address;
      const value = 0;
      const data = "0x";
      const predecessor = ethers.ZeroHash;
      const salt = ethers.id("test");
      const delay = minDelay;

      await timelockVault.connect(proposer).schedule(target, value, data, predecessor, salt, delay);
      
      const operationId = await timelockVault.hashOperation(target, value, data, predecessor, salt);
      
      expect(await timelockVault.isOperationPending(operationId)).to.equal(true);
      expect(await timelockVault.isOperationReady(operationId)).to.equal(false);
      expect(await timelockVault.isOperationDone(operationId)).to.equal(false);
      
      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [minDelay + 1]);
      await ethers.provider.send("evm_mine");
      
      expect(await timelockVault.isOperationPending(operationId)).to.equal(true);
      expect(await timelockVault.isOperationReady(operationId)).to.equal(true);
      expect(await timelockVault.isOperationDone(operationId)).to.equal(false);
    });

    it("Should report operations as not ready/pending when in recovery mode", async function () {
      const target = user1.address;
      const value = 0;
      const data = "0x";
      const predecessor = ethers.ZeroHash;
      const salt = ethers.id("test");
      const delay = minDelay;

      await timelockVault.connect(proposer).schedule(target, value, data, predecessor, salt, delay);
      
      const operationId = await timelockVault.hashOperation(target, value, data, predecessor, salt);
      
      // Fast forward time
      await ethers.provider.send("evm_increaseTime", [minDelay + 1]);
      await ethers.provider.send("evm_mine");
      
      expect(await timelockVault.isOperationReady(operationId)).to.equal(true);
      expect(await timelockVault.isOperationPending(operationId)).to.equal(true);
      
      await timelockVault.connect(recoveryTriggerer).triggerRecoveryMode();
      
      expect(await timelockVault.isOperationReady(operationId)).to.equal(false);
      expect(await timelockVault.isOperationPending(operationId)).to.equal(false);
    });
  });

  describe("Batch Operations", function () {
    it("Should handle batch operations correctly", async function () {
      const targets = [user1.address, user2.address];
      const values = [0, 0];
      const payloads = ["0x", "0x"];
      const predecessor = ethers.ZeroHash;
      const salt = ethers.id("test");
      const delay = minDelay;

      await expect(timelockVault.connect(proposer).scheduleBatch(targets, values, payloads, predecessor, salt, delay))
        .to.not.be.reverted;
    });

    it("Should not allow batch operations in recovery mode", async function () {
      await timelockVault.connect(recoveryTriggerer).triggerRecoveryMode();
      
      const targets = [user1.address, user2.address];
      const values = [0, 0];
      const payloads = ["0x", "0x"];
      const predecessor = ethers.ZeroHash;
      const salt = ethers.id("test");
      const delay = minDelay;

      await expect(timelockVault.connect(proposer).scheduleBatch(targets, values, payloads, predecessor, salt, delay))
        .to.be.revertedWith("TimelockVault: Cannot perform operation in recovery mode");
    });
  });
}); 