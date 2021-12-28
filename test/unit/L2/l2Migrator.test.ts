import {Signer} from '@ethersproject/abstract-signer';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {expect} from 'chai';

import {ethers} from 'hardhat';
import {L2Migrator, L2Migrator__factory} from '../../../typechain';
import {getL2SignerFromL1} from '../../utils/messaging';

describe('L2Migrator', function() {
  let l2Migrator: L2Migrator;

  let notL1MigratorEOA: SignerWithAddress;

  // mocks
  let mockL1MigratorEOA: SignerWithAddress;
  let mockL1MigratorL2AliasEOA: Signer;

  const mockMigrateDelegatorParams = {
    l1Addr: ethers.constants.AddressZero,
    l2Addr: ethers.constants.AddressZero,
    stake: 100,
    delegatedStake: 200,
    fees: 300,
    delegate: ethers.constants.AddressZero,
  };

  const mockMigrateUnbondingLocksParams = {
    l1Addr: ethers.constants.AddressZero,
    l2Addr: ethers.constants.AddressZero,
    total: 100,
    unbondingLockIds: [1, 2],
  };

  const mockMigrateSenderParams = {
    l1Addr: ethers.constants.AddressZero,
    l2Addr: ethers.constants.AddressZero,
    deposit: 100,
    reserve: 100,
  };

  beforeEach(async function() {
    [notL1MigratorEOA, mockL1MigratorEOA] = await ethers.getSigners();

    const L2Migrator: L2Migrator__factory = await ethers.getContractFactory(
        'L2Migrator',
    );
    l2Migrator = await L2Migrator.deploy(mockL1MigratorEOA.address);
    await l2Migrator.deployed();

    // TODO: Modify getL2SignerFromL1 to return Promise<SignerWithAddress> instead of
    // Promise<Signer>?
    mockL1MigratorL2AliasEOA = await getL2SignerFromL1(mockL1MigratorEOA);
    await mockL1MigratorEOA.sendTransaction({
      to: await mockL1MigratorL2AliasEOA.getAddress(),
      value: ethers.utils.parseUnits('1', 'ether'),
    });
  });

  describe('constructor', () => {
    it('sets addresses', async () => {
      const l1MigratorAddr = await l2Migrator.l1Migrator();
      expect(l1MigratorAddr).to.equal(mockL1MigratorEOA.address);
    });
  });

  describe('setL1Migrator', () => {
    it('sets l1Migrator', async () => {
      await l2Migrator.setL1Migrator(notL1MigratorEOA.address);
      const l1MigratorAddr = await l2Migrator.l1Migrator();
      expect(l1MigratorAddr).to.equal(notL1MigratorEOA.address);
    });
  });

  describe('finalizeMigrateDelegator', () => {
    it('reverts if msg.sender is not L1Migrator L2 alias', async () => {
      // msg.sender = some invalid address
      let tx = l2Migrator
          .connect(notL1MigratorEOA)
          .finalizeMigrateDelegator(mockMigrateDelegatorParams);
      await expect(tx).to.revertedWith('ONLY_COUNTERPART_GATEWAY');

      // msg.sender = L1Migrator (no alias)
      tx = l2Migrator
          .connect(mockL1MigratorEOA)
          .finalizeMigrateDelegator(mockMigrateDelegatorParams);
      await expect(tx).to.revertedWith('ONLY_COUNTERPART_GATEWAY');
    });

    it('finalizes migration', async () => {
      const tx = l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateDelegator(mockMigrateDelegatorParams);

      await expect(tx).to.emit(l2Migrator, 'MigrateDelegatorFinalized');
      // The assertion below does not work until https://github.com/EthWorks/Waffle/issues/245 is fixed
      // .withArgs(seqNo, mockMigrateDelegatorParams)
    });
  });

  describe('finalizeMigrateUnbondingLocks', () => {
    it('reverts if msg.sender is not L1Migrator L2 alias', async () => {
      // msg.sender = some invalid address
      let tx = l2Migrator
          .connect(notL1MigratorEOA)
          .finalizeMigrateUnbondingLocks(mockMigrateUnbondingLocksParams);
      await expect(tx).to.revertedWith('ONLY_COUNTERPART_GATEWAY');

      // msg.sender = L1Migrator (no alias)
      tx = l2Migrator
          .connect(mockL1MigratorEOA)
          .finalizeMigrateUnbondingLocks(mockMigrateUnbondingLocksParams);
      await expect(tx).to.revertedWith('ONLY_COUNTERPART_GATEWAY');
    });

    it('finalizes migration', async () => {
      const tx = l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateUnbondingLocks(mockMigrateUnbondingLocksParams);

      await expect(tx).to.emit(l2Migrator, 'MigrateUnbondingLocksFinalized');
      // The assertion below does not work until https://github.com/EthWorks/Waffle/issues/245 is fixed
      // .withArgs(seqNo, mockMigrateUnbondingLocksParams)
    });
  });

  describe('finalizeMigrateSender', () => {
    it('reverts if msg.sender is not L1Migrator L2 alias', async () => {
      // msg.sender = some invalid address
      let tx = l2Migrator
          .connect(notL1MigratorEOA)
          .finalizeMigrateSender(mockMigrateSenderParams);
      await expect(tx).to.revertedWith('ONLY_COUNTERPART_GATEWAY');

      // msg.sender = L1Migrator (no alias)
      tx = l2Migrator
          .connect(mockL1MigratorEOA)
          .finalizeMigrateSender(mockMigrateSenderParams);
      await expect(tx).to.revertedWith('ONLY_COUNTERPART_GATEWAY');
    });

    it('finalizes migration', async () => {
      const tx = l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateSender(mockMigrateSenderParams);

      await expect(tx).to.emit(l2Migrator, 'MigrateSenderFinalized');
      // The assertion below does not work until https://github.com/EthWorks/Waffle/issues/245 is fixed
      // .withArgs(seqNo, mockMigrateSenderParams)
    });
  });
});
