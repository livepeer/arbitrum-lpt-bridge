import {FakeContract, smock} from '@defi-wonderland/smock';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {expect, use} from 'chai';

import {ethers} from 'hardhat';
import {L2Migrator, L2Migrator__factory} from '../../../typechain';
import {getL2SignerFromL1} from '../../utils/messaging';

use(smock.matchers);

describe('L2Migrator', function() {
  let l2Migrator: L2Migrator;

  let notL1MigratorEOA: SignerWithAddress;
  let l1AddrEOA: SignerWithAddress;
  let l2AddrEOA: SignerWithAddress;

  // mocks
  let bondingManagerMock: FakeContract;
  let ticketBrokerMock: FakeContract;
  let merkleSnapshotMock: FakeContract;
  let mockL1MigratorEOA: SignerWithAddress;
  let mockL1MigratorL2AliasEOA: SignerWithAddress;
  let mockDelegatorPoolEOA: SignerWithAddress;
  let mockBondingManagerEOA: SignerWithAddress;
  let mockTicketBrokerEOA: SignerWithAddress;
  let mockMerkleSnapshotEOA: SignerWithAddress;

  const mockMigrateDelegatorParams = () => ({
    l1Addr: ethers.constants.AddressZero,
    l2Addr: ethers.constants.AddressZero,
    stake: 100,
    delegatedStake: 200,
    fees: 0,
    delegate: ethers.constants.AddressZero,
  });

  const mockMigrateUnbondingLocksParams = () => ({
    l1Addr: ethers.constants.AddressZero,
    l2Addr: ethers.constants.AddressZero,
    total: 100,
    unbondingLockIds: [1, 2, 3],
    delegate: ethers.constants.AddressZero,
  });

  const mockMigrateSenderParams = () => ({
    l1Addr: ethers.constants.AddressZero,
    l2Addr: ethers.constants.AddressZero,
    deposit: 100,
    reserve: 200,
  });

  beforeEach(async function() {
    [
      notL1MigratorEOA,
      l1AddrEOA,
      l2AddrEOA,
      mockL1MigratorEOA,
      mockDelegatorPoolEOA,
      mockBondingManagerEOA,
      mockTicketBrokerEOA,
      mockMerkleSnapshotEOA,
    ] = await ethers.getSigners();

    const L2Migrator: L2Migrator__factory = await ethers.getContractFactory(
        'L2Migrator',
    );
    l2Migrator = await L2Migrator.deploy(
        mockL1MigratorEOA.address,
        mockDelegatorPoolEOA.address,
        mockBondingManagerEOA.address,
        mockTicketBrokerEOA.address,
        mockMerkleSnapshotEOA.address,
    );
    await l2Migrator.deployed();

    bondingManagerMock = await smock.fake(
        'contracts/L2/gateway/L2Migrator.sol:IBondingManager',
        {
          address: mockBondingManagerEOA.address,
        },
    );

    ticketBrokerMock = await smock.fake(
        'contracts/L2/gateway/L2Migrator.sol:ITicketBroker',
        {
          address: mockTicketBrokerEOA.address,
        },
    );

    merkleSnapshotMock = await smock.fake('IMerkleSnapshot', {
      address: mockMerkleSnapshotEOA.address,
    });

    mockL1MigratorL2AliasEOA = await getL2SignerFromL1(mockL1MigratorEOA);
    await mockL1MigratorEOA.sendTransaction({
      to: mockL1MigratorL2AliasEOA.address,
      value: ethers.utils.parseUnits('1', 'ether'),
    });

    merkleSnapshotMock.verify.returns(true);
  });

  describe('constructor', () => {
    it('sets addresses', async () => {
      const l1MigratorAddr = await l2Migrator.l1Migrator();
      expect(l1MigratorAddr).to.equal(mockL1MigratorEOA.address);
      const delegatorPoolImpl = await l2Migrator.delegatorPoolImpl();
      expect(delegatorPoolImpl).to.equal(mockDelegatorPoolEOA.address);
      const bondingManagerAddr = await l2Migrator.bondingManagerAddr();
      expect(bondingManagerAddr).to.equal(mockBondingManagerEOA.address);
      const ticketBrokerAddr = await l2Migrator.ticketBrokerAddr();
      expect(ticketBrokerAddr).to.equal(mockTicketBrokerEOA.address);
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
          .finalizeMigrateDelegator(mockMigrateDelegatorParams());
      await expect(tx).to.revertedWith('ONLY_COUNTERPART_GATEWAY');

      // msg.sender = L1Migrator (no alias)
      tx = l2Migrator
          .connect(mockL1MigratorEOA)
          .finalizeMigrateDelegator(mockMigrateDelegatorParams());
      await expect(tx).to.revertedWith('ONLY_COUNTERPART_GATEWAY');
    });

    it('reverts when l1Addr already migrated', async () => {
      await l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateDelegator(mockMigrateDelegatorParams());

      const tx = l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateDelegator(mockMigrateDelegatorParams());
      await expect(tx).to.revertedWith(
          'L2Migrator#finalizeMigrateDelegator: ALREADY_MIGRATED',
      );
    });

    it('reverts if fee transfer fails', async () => {
      const params = {
        ...mockMigrateDelegatorParams(),
        fees: 300,
      };

      const tx = l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateDelegator(params);
      await expect(tx).to.revertedWith(
          'L2Migrator#finalizeMigrateDelegator: FAIL_FEE',
      );
    });

    describe('finalizes migration', () => {
      it('no delegator pool if l1Addr != delegate', async () => {
        const params = {
          ...mockMigrateDelegatorParams(),
          l1Addr: l1AddrEOA.address,
          l2Addr: l2AddrEOA.address,
          delegate: l2AddrEOA.address,
        };

        const tx = await l2Migrator
            .connect(mockL1MigratorL2AliasEOA)
            .finalizeMigrateDelegator(params);

        expect(await l2Migrator.migratedDelegators(params.l1Addr)).to.be.true;

        expect(await l2Migrator.delegatorPools(params.l1Addr)).to.be.equal(
            ethers.constants.AddressZero,
        );

        expect(bondingManagerMock.bondForWithHint).to.be.calledOnceWith(
            params.stake,
            params.l2Addr,
            params.delegate,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
        );

        await expect(tx).to.not.emit(l2Migrator, 'DelegatorPoolCreated');

        await expect(tx).to.emit(l2Migrator, 'MigrateDelegatorFinalized');
        // The assertion below does not work until https://github.com/EthWorks/Waffle/issues/245 is fixed
        // .withArgs(seqNo, params)
      });

      it('creates delegator pool if l1Addr == delegate', async () => {
        const params = {
          ...mockMigrateDelegatorParams(),
          l1Addr: l1AddrEOA.address,
          l2Addr: l2AddrEOA.address,
          delegate: l1AddrEOA.address,
        };

        const tx = await l2Migrator
            .connect(mockL1MigratorL2AliasEOA)
            .finalizeMigrateDelegator(params);

        expect(await l2Migrator.migratedDelegators(params.l1Addr)).to.be.true;

        const delegatorPool = await l2Migrator.delegatorPools(params.l1Addr);
        expect(delegatorPool).to.not.be.equal(ethers.constants.AddressZero);

        expect(bondingManagerMock.bondForWithHint.atCall(0)).to.be.calledWith(
            params.stake,
            params.l2Addr,
            params.delegate,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
        );

        expect(bondingManagerMock.bondForWithHint.atCall(1)).to.be.calledWith(
            params.delegatedStake,
            delegatorPool,
            params.delegate,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
        );

        await expect(tx)
            .to.emit(l2Migrator, 'DelegatorPoolCreated')
            .withArgs(params.l1Addr, delegatorPool);

        await expect(tx).to.emit(l2Migrator, 'MigrateDelegatorFinalized');
        // The assertion below does not work until https://github.com/EthWorks/Waffle/issues/245 is fixed
        // .withArgs(seqNo, params)
      });

      it('subtracted claimed delegated stake when staking for delegator pool', async () => {
        const delegator = l2AddrEOA;
        const delegate = l1AddrEOA.address;
        const stake = 50;
        const fees = 0;

        await l2Migrator.connect(delegator).claimStake(
            delegate,
            stake,
            fees,
            [],
            ethers.constants.AddressZero,
        );

        expect(await l2Migrator.claimedDelegatedStake(delegate)).to.be.equal(stake);

        const params = mockMigrateDelegatorParams();
        params.l1Addr = delegate;
        params.l2Addr = delegate;
        params.delegate = delegate;

        bondingManagerMock.bondForWithHint.reset();

        await l2Migrator.connect(mockL1MigratorL2AliasEOA).finalizeMigrateDelegator(
            params,
        );

        const delegatorPool = await l2Migrator.delegatorPools(params.l1Addr);
        expect(bondingManagerMock.bondForWithHint.atCall(1)).to.be.calledWith(
            params.delegatedStake - stake,
            delegatorPool,
            params.delegate,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
        );
      });

      it('transfers fees if > 0', async () => {
        const params = {
          ...mockMigrateDelegatorParams(),
          l1Addr: l1AddrEOA.address,
          l2Addr: l2AddrEOA.address,
          delegate: l2AddrEOA.address,
          fees: 300,
        };

        await mockL1MigratorEOA.sendTransaction({
          to: l2Migrator.address,
          value: ethers.utils.parseUnits('1', 'ether'),
        });

        const tx = await l2Migrator
            .connect(mockL1MigratorL2AliasEOA)
            .finalizeMigrateDelegator(params);
        await expect(tx).to.changeEtherBalance(l2AddrEOA, params.fees);
      });
    });
  });

  describe('finalizeMigrateUnbondingLocks', () => {
    it('reverts if msg.sender is not L1Migrator L2 alias', async () => {
      // msg.sender = some invalid address
      let tx = l2Migrator
          .connect(notL1MigratorEOA)
          .finalizeMigrateUnbondingLocks(mockMigrateUnbondingLocksParams());
      await expect(tx).to.revertedWith('ONLY_COUNTERPART_GATEWAY');

      // msg.sender = L1Migrator (no alias)
      tx = l2Migrator
          .connect(mockL1MigratorEOA)
          .finalizeMigrateUnbondingLocks(mockMigrateUnbondingLocksParams());
      await expect(tx).to.revertedWith('ONLY_COUNTERPART_GATEWAY');
    });

    it('reverts if any unbonding lock ids have been migrated', async () => {
      const params = mockMigrateUnbondingLocksParams();
      await l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateUnbondingLocks(params);

      // First id migrated
      params.unbondingLockIds = [1, 7, 8];
      let tx = l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateUnbondingLocks(params);

      await expect(tx).to.revertedWith(
          'L2Migrator#finalizeMigrateUnbondingLocks: ALREADY_MIGRATED',
      );

      // Middle id migrated
      params.unbondingLockIds = [7, 2, 8];
      tx = l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateUnbondingLocks(params);

      await expect(tx).to.revertedWith(
          'L2Migrator#finalizeMigrateUnbondingLocks: ALREADY_MIGRATED',
      );

      // Last id migrated
      params.unbondingLockIds = [7, 8, 3];
      tx = l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateUnbondingLocks(params);

      await expect(tx).to.revertedWith(
          'L2Migrator#finalizeMigrateUnbondingLocks: ALREADY_MIGRATED',
      );
    });

    it('finalizes migration', async () => {
      const params = mockMigrateUnbondingLocksParams();
      params.l1Addr = l1AddrEOA.address;
      params.l2Addr = l2AddrEOA.address;
      params.delegate = l2AddrEOA.address;

      const tx = await l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateUnbondingLocks(params);

      for (const id of params.unbondingLockIds) {
        expect(await l2Migrator.migratedUnbondingLocks(params.l1Addr, id)).to.be
            .true;
      }

      expect(bondingManagerMock.bondForWithHint).to.be.calledOnceWith(
          params.total,
          params.l2Addr,
          params.delegate,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
          ethers.constants.AddressZero,
      );

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
          .finalizeMigrateSender(mockMigrateSenderParams());
      await expect(tx).to.revertedWith('ONLY_COUNTERPART_GATEWAY');

      // msg.sender = L1Migrator (no alias)
      tx = l2Migrator
          .connect(mockL1MigratorEOA)
          .finalizeMigrateSender(mockMigrateSenderParams());
      await expect(tx).to.revertedWith('ONLY_COUNTERPART_GATEWAY');
    });

    it('reverts when l1Addr already migrated', async () => {
      await l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateSender(mockMigrateSenderParams());

      const tx = l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateSender(mockMigrateSenderParams());
      await expect(tx).to.revertedWith(
          'L2Migrator#finalizeMigrateSender: ALREADY_MIGRATED',
      );
    });

    it('finalizes migration', async () => {
      const params = {
        ...mockMigrateSenderParams(),
        l1Addr: l1AddrEOA.address,
        l2Addr: l2AddrEOA.address,
      };

      const tx = await l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateSender(params);

      expect(await l2Migrator.migratedSenders(params.l1Addr)).to.be.true;

      expect(ticketBrokerMock.fundDepositAndReserveFor).to.be.calledOnceWith(
          params.l2Addr,
          params.deposit,
          params.reserve,
      );

      await expect(tx).to.emit(l2Migrator, 'MigrateSenderFinalized');
      // The assertion below does not work until https://github.com/EthWorks/Waffle/issues/245 is fixed
      // .withArgs(seqNo, mockMigrateSenderParams)
    });
  });

  describe('receive', () => {
    it('receives ETH', async () => {
      const value = ethers.utils.parseUnits('1', 'ether');
      const tx = await mockL1MigratorEOA.sendTransaction({
        to: l2Migrator.address,
        value,
      });

      await expect(tx).to.changeEtherBalance(l2Migrator, value);
    });
  });

  describe('claimStake', () => {
    it('reverts for invalid proof', async () => {
      merkleSnapshotMock.verify.returns(false);

      const tx = l2Migrator.connect(l1AddrEOA).claimStake(
          ethers.constants.AddressZero,
          0,
          0,
          [],
          ethers.constants.AddressZero,
      );
      await expect(tx).to.revertedWith('L2Migrator#claimStake: INVALID_PROOF');
    });

    it('reverts if delegator is already migrated', async () => {
      await l2Migrator.connect(l1AddrEOA).claimStake(
          l2AddrEOA.address,
          100,
          0,
          [],
          ethers.constants.AddressZero,
      );

      const tx = l2Migrator.connect(l1AddrEOA).claimStake(
          l2AddrEOA.address,
          100,
          0,
          [],
          ethers.constants.AddressZero,
      );
      expect(tx).to.revertedWith('L2Migrator#claimStake: ALREADY_MIGRATED');
    });

    it('reverts if fee transfer fails', async () => {
      const tx = l2Migrator.connect(l1AddrEOA).claimStake(
          l2AddrEOA.address,
          100,
          200,
          [],
          ethers.constants.AddressZero,
      );
      expect(tx).to.be.reverted;
    });

    describe('claims stake', () => {
      it('claims stake from delegator pool if it exists', async () => {
        const params = mockMigrateDelegatorParams();
        params.l1Addr = l1AddrEOA.address;
        params.l2Addr = l1AddrEOA.address;
        params.delegate = l1AddrEOA.address;

        await l2Migrator.connect(mockL1MigratorL2AliasEOA).finalizeMigrateDelegator(params);

        const delegatorPoolAddr = await l2Migrator.delegatorPools(params.l1Addr);
        expect(delegatorPoolAddr).to.not.be.equal(ethers.constants.AddressZero);

        const delegatorPoolMock: FakeContract = await smock.fake('IDelegatorPool', {
          address: delegatorPoolAddr,
        });

        const delegator = l2AddrEOA;
        const delegate = l1AddrEOA.address;
        const stake = 100;
        const fees = 0;

        expect(await l2Migrator.claimedDelegatedStake(delegate)).to.be.equal(0);

        const tx = await l2Migrator.connect(delegator).claimStake(
            delegate,
            stake,
            fees,
            [],
            ethers.constants.AddressZero,
        );

        expect(await l2Migrator.migratedDelegators(delegator.address)).to.be.true;
        expect(await l2Migrator.claimedDelegatedStake(delegate)).to.be.equal(stake);
        expect(delegatorPoolMock.claim).to.be.calledOnceWith(l2AddrEOA.address, 100);

        await expect(tx)
            .to.emit(l2Migrator, 'StakeClaimed')
            .withArgs(delegator.address, delegate, stake, fees);
      });

      it('stakes in BondingManager if delegator pool does not exist', async () => {
        const delegator = l1AddrEOA;
        const delegate = l2AddrEOA.address;
        const stake = 100;
        const fees = 0;

        expect(await l2Migrator.delegatorPools(delegate)).to.be.equal(ethers.constants.AddressZero);
        expect(await l2Migrator.claimedDelegatedStake(delegate)).to.be.equal(0);

        const tx = await l2Migrator.connect(delegator).claimStake(
            delegate,
            stake,
            fees,
            [],
            ethers.constants.AddressZero,
        );

        expect(await l2Migrator.migratedDelegators(delegator.address)).to.be.true;
        expect(await l2Migrator.claimedDelegatedStake(delegate)).to.be.equal(stake);
        expect(bondingManagerMock.bondForWithHint).to.be.calledOnceWith(
            stake,
            delegator.address,
            delegate,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
        );

        await expect(tx)
            .to.emit(l2Migrator, 'StakeClaimed')
            .withArgs(delegator.address, delegate, stake, fees);
      });

      it('stakes in BondingManager with specified new delegate', async () => {
        const delegator = l1AddrEOA;
        const delegate = l2AddrEOA.address;
        const stake = 100;
        const fees = 0;
        const newDelegate = l2Migrator.address;

        const tx = await l2Migrator.connect(delegator).claimStake(
            delegate,
            stake,
            fees,
            [],
            newDelegate,
        );

        expect(bondingManagerMock.bondForWithHint).to.be.calledOnceWith(
            stake,
            delegator.address,
            newDelegate,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
            ethers.constants.AddressZero,
        );

        await expect(tx)
            .to.emit(l2Migrator, 'StakeClaimed')
            .withArgs(delegator.address, newDelegate, stake, fees);
      });

      it('transfers if fees > 0', async () => {
        const delegator = l1AddrEOA;
        const delegate = l2AddrEOA.address;
        const stake = 100;
        const fees = 200;

        await mockL1MigratorEOA.sendTransaction({
          to: l2Migrator.address,
          value: ethers.utils.parseUnits('1', 'ether'),
        });

        const tx = await l2Migrator.connect(delegator).claimStake(
            delegate,
            stake,
            fees,
            [],
            ethers.constants.AddressZero,
        );

        await expect(tx).to.changeEtherBalance(delegator, fees);
      });
    });
  });
});
