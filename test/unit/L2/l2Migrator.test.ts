import {FakeContract, smock} from '@defi-wonderland/smock';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {expect, use} from 'chai';

import {ethers, network} from 'hardhat';
import {
  DelegatorPool,
  DelegatorPool__factory,
  L2Migrator,
  L2Migrator__factory,
} from '../../../typechain';
import {getL2SignerFromL1} from '../../utils/messaging';

use(smock.matchers);

describe('L2Migrator', function() {
  let l2Migrator: L2Migrator;
  let delegatorPool: DelegatorPool;

  let notL1MigratorEOA: SignerWithAddress;
  let l1AddrEOA: SignerWithAddress;
  let l2AddrEOA: SignerWithAddress;
  let owner: SignerWithAddress;
  let admin: SignerWithAddress;

  // mocks
  let bondingManagerMock: FakeContract;
  let ticketBrokerMock: FakeContract;
  let merkleSnapshotMock: FakeContract;
  let tokenMock: FakeContract;
  let controllerMock: FakeContract;
  let mockL1MigratorEOA: SignerWithAddress;
  let mockL1MigratorL2AliasEOA: SignerWithAddress;
  let mockBondingManagerEOA: SignerWithAddress;
  let mockTicketBrokerEOA: SignerWithAddress;
  let mockMerkleSnapshotEOA: SignerWithAddress;
  let mockTokenEOA: SignerWithAddress;
  let mockControllerEOA: SignerWithAddress;

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
      owner,
      admin,
      notL1MigratorEOA,
      l1AddrEOA,
      l2AddrEOA,
      mockL1MigratorEOA,
      mockBondingManagerEOA,
      mockTicketBrokerEOA,
      mockMerkleSnapshotEOA,
      mockTokenEOA,
      mockControllerEOA,
    ] = await ethers.getSigners();

    controllerMock = await smock.fake(
        'contracts/proxy/IController.sol:IController',
        {
          address: mockControllerEOA.address,
        },
    );

    controllerMock.owner.returns(admin.address);

    controllerMock.getContract
        .whenCalledWith(
            ethers.utils.solidityKeccak256(['string'], ['BondingManager']),
        )
        .returns(mockBondingManagerEOA.address);

    controllerMock.getContract
        .whenCalledWith(
            ethers.utils.solidityKeccak256(['string'], ['TicketBroker']),
        )
        .returns(mockTicketBrokerEOA.address);

    controllerMock.getContract
        .whenCalledWith(
            ethers.utils.solidityKeccak256(['string'], ['MerkleSnapshot']),
        )
        .returns(mockMerkleSnapshotEOA.address);

    controllerMock.getContract
        .whenCalledWith(
            ethers.utils.solidityKeccak256(['string'], ['LivepeerToken']),
        )
        .returns(mockTokenEOA.address);

    const DelegatorPool: DelegatorPool__factory =
      await ethers.getContractFactory('DelegatorPool');
    delegatorPool = await DelegatorPool.deploy();

    const L2Migrator: L2Migrator__factory = await ethers.getContractFactory(
        'L2Migrator',
    );
    l2Migrator = await L2Migrator.deploy(mockControllerEOA.address);
    await l2Migrator.deployed();

    await l2Migrator
        .connect(admin)
        .initialize(mockL1MigratorEOA.address, delegatorPool.address);
    await l2Migrator.connect(admin).setClaimStakeEnabled(true);

    const bondingManagerAbi = [
      'function bondForWithHint(uint256,address,address,address,address,address,address)',
      'function pendingStake(address,uint256) returns(uint256)',
    ];
    bondingManagerMock = await smock.fake(
        {
          abi: bondingManagerAbi,
        },
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

    tokenMock = await smock.fake(
        'contracts/L2/gateway/L2Migrator.sol:ApproveLike',
        {
          address: mockTokenEOA.address,
        },
    );

    mockL1MigratorL2AliasEOA = await getL2SignerFromL1(mockL1MigratorEOA);
    await mockL1MigratorEOA.sendTransaction({
      to: mockL1MigratorL2AliasEOA.address,
      value: ethers.utils.parseUnits('1', 'ether'),
    });

    merkleSnapshotMock.verify.returns(true);
  });

  describe('initializer', () => {
    it('sets addresses', async () => {
      const l1MigratorAddr = await l2Migrator.l1MigratorAddr();
      expect(l1MigratorAddr).to.equal(mockL1MigratorEOA.address);
      const delegatorPoolImpl = await l2Migrator.delegatorPoolImpl();
      expect(delegatorPoolImpl).to.equal(delegatorPool.address);
      const bondingManagerAddr = await l2Migrator.bondingManagerAddr();
      expect(bondingManagerAddr).to.equal(mockBondingManagerEOA.address);
      const ticketBrokerAddr = await l2Migrator.ticketBrokerAddr();
      expect(ticketBrokerAddr).to.equal(mockTicketBrokerEOA.address);
      const merkleSnapshotAddr = await l2Migrator.merkleSnapshotAddr();
      expect(merkleSnapshotAddr).to.equal(mockMerkleSnapshotEOA.address);
    });
  });

  describe('initialize', () => {
    describe('when caller not controller owner', async () => {
      it('should fail to set addresses', async () => {
        const addr = ethers.constants.AddressZero;
        const tx = l2Migrator.connect(owner).initialize(addr, addr);
        await expect(tx).to.be.revertedWith('caller must be Controller owner');
      });
    });

    describe('when caller is controller owner', async () => {
      it('should set addresses', async () => {
        const addr = ethers.constants.AddressZero;
        await l2Migrator.connect(admin).initialize(addr, addr);

        const l1MigratorAddr = await l2Migrator.l1MigratorAddr();
        expect(l1MigratorAddr).to.equal(addr);
        const delegatorPoolImpl = await l2Migrator.delegatorPoolImpl();
        expect(delegatorPoolImpl).to.equal(addr);
        const bondingManagerAddr = await l2Migrator.bondingManagerAddr();
        expect(bondingManagerAddr).to.equal(mockBondingManagerEOA.address);
        const ticketBrokerAddr = await l2Migrator.ticketBrokerAddr();
        expect(ticketBrokerAddr).to.equal(mockTicketBrokerEOA.address);
        const merkleSnapshotAddr = await l2Migrator.merkleSnapshotAddr();
        expect(merkleSnapshotAddr).to.equal(mockMerkleSnapshotEOA.address);
      });
    });
  });

  describe('syncControllerContracts', () => {
    const bondingManagerID = ethers.utils.solidityKeccak256(
        ['string'],
        ['BondingManager'],
    );
    const ticketBrokerID = ethers.utils.solidityKeccak256(
        ['string'],
        ['TicketBroker'],
    );
    const merkleSnapshotID = ethers.utils.solidityKeccak256(
        ['string'],
        ['MerkleSnapshot'],
    );
    const tokenID = ethers.utils.solidityKeccak256(
        ['string'],
        ['LivepeerToken'],
    );

    describe('addresses do not change', () => {
      it('should set addresses', async () => {
        const tx = l2Migrator.syncControllerContracts();
        await expect(tx).to.not.emit(l2Migrator, 'ControllerContractUpdate');
      });
    });

    describe('only bondingManager changes', () => {
      it('should set addresses', async () => {
        controllerMock.getContract
            .whenCalledWith(bondingManagerID)
            .returns(ethers.constants.AddressZero);

        const tx = await l2Migrator.syncControllerContracts();

        await expect(tx)
            .to.emit(l2Migrator, 'ControllerContractUpdate')
            .withArgs(bondingManagerID, ethers.constants.AddressZero);

        // confirm only a single event was emitted
        const events = await l2Migrator.queryFilter(
            l2Migrator.filters.ControllerContractUpdate(),
            'latest',
        );
        expect(events.length).to.equal(1);

        expect(await l2Migrator.bondingManagerAddr()).to.equal(
            ethers.constants.AddressZero,
        );
        expect(await l2Migrator.ticketBrokerAddr()).to.equal(
            mockTicketBrokerEOA.address,
        );
        expect(await l2Migrator.merkleSnapshotAddr()).to.equal(
            mockMerkleSnapshotEOA.address,
        );
      });
    });

    describe('only ticketBroker changes', () => {
      it('should set addresses', async () => {
        controllerMock.getContract
            .whenCalledWith(ticketBrokerID)
            .returns(ethers.constants.AddressZero);

        const tx = await l2Migrator.syncControllerContracts();
        await expect(tx)
            .to.emit(l2Migrator, 'ControllerContractUpdate')
            .withArgs(ticketBrokerID, ethers.constants.AddressZero);

        // confirm only a single event was emitted
        const events = await l2Migrator.queryFilter(
            l2Migrator.filters.ControllerContractUpdate(),
            'latest',
        );
        expect(events.length).to.equal(1);

        expect(await l2Migrator.bondingManagerAddr()).to.equal(
            mockBondingManagerEOA.address,
        );
        expect(await l2Migrator.ticketBrokerAddr()).to.equal(
            ethers.constants.AddressZero,
        );
        expect(await l2Migrator.merkleSnapshotAddr()).to.equal(
            mockMerkleSnapshotEOA.address,
        );
      });
    });

    describe('only merkleSnapshot changes', () => {
      it('should set addresses', async () => {
        controllerMock.getContract
            .whenCalledWith(merkleSnapshotID)
            .returns(ethers.constants.AddressZero);

        const tx = await l2Migrator.syncControllerContracts();
        await expect(tx)
            .to.emit(l2Migrator, 'ControllerContractUpdate')
            .withArgs(merkleSnapshotID, ethers.constants.AddressZero);

        // confirm only a single event was emitted
        const events = await l2Migrator.queryFilter(
            l2Migrator.filters.ControllerContractUpdate(),
            'latest',
        );
        expect(events.length).to.equal(1);

        expect(await l2Migrator.bondingManagerAddr()).to.equal(
            mockBondingManagerEOA.address,
        );
        expect(await l2Migrator.ticketBrokerAddr()).to.equal(
            mockTicketBrokerEOA.address,
        );
        expect(await l2Migrator.merkleSnapshotAddr()).to.equal(
            ethers.constants.AddressZero,
        );
      });
    });

    describe('only token changes', () => {
      it('should set addresses', async () => {
        controllerMock.getContract
            .whenCalledWith(tokenID)
            .returns(ethers.constants.AddressZero);

        const tx = await l2Migrator.syncControllerContracts();
        await expect(tx)
            .to.emit(l2Migrator, 'ControllerContractUpdate')
            .withArgs(tokenID, ethers.constants.AddressZero);

        // confirm only a single event was emitted
        const events = await l2Migrator.queryFilter(
            l2Migrator.filters.ControllerContractUpdate(),
            'latest',
        );
        expect(events.length).to.equal(1);

        expect(await l2Migrator.bondingManagerAddr()).to.equal(
            mockBondingManagerEOA.address,
        );
        expect(await l2Migrator.ticketBrokerAddr()).to.equal(
            mockTicketBrokerEOA.address,
        );
        expect(await l2Migrator.merkleSnapshotAddr()).to.equal(
            mockMerkleSnapshotEOA.address,
        );
        expect(await l2Migrator.tokenAddr()).to.equal(
            ethers.constants.AddressZero,
        );
      });
    });

    describe('all 4 change', () => {
      it('should set addresses', async () => {
        controllerMock.getContract
            .whenCalledWith(bondingManagerID)
            .returns(ethers.constants.AddressZero);

        controllerMock.getContract
            .whenCalledWith(ticketBrokerID)
            .returns(ethers.constants.AddressZero);

        controllerMock.getContract
            .whenCalledWith(merkleSnapshotID)
            .returns(ethers.constants.AddressZero);

        controllerMock.getContract
            .whenCalledWith(tokenID)
            .returns(ethers.constants.AddressZero);

        const tx = await l2Migrator.syncControllerContracts();

        await expect(tx)
            .to.emit(l2Migrator, 'ControllerContractUpdate')
            .withArgs(bondingManagerID, ethers.constants.AddressZero);
        await expect(tx)
            .to.emit(l2Migrator, 'ControllerContractUpdate')
            .withArgs(ticketBrokerID, ethers.constants.AddressZero);
        await expect(tx)
            .to.emit(l2Migrator, 'ControllerContractUpdate')
            .withArgs(merkleSnapshotID, ethers.constants.AddressZero);
        await expect(tx)
            .to.emit(l2Migrator, 'ControllerContractUpdate')
            .withArgs(tokenID, ethers.constants.AddressZero);

        // confirm four events were emitted
        const events = await l2Migrator.queryFilter(
            l2Migrator.filters.ControllerContractUpdate(),
            'latest',
        );
        expect(events.length).to.equal(4);

        expect(await l2Migrator.bondingManagerAddr()).to.equal(
            ethers.constants.AddressZero,
        );
        expect(await l2Migrator.ticketBrokerAddr()).to.equal(
            ethers.constants.AddressZero,
        );
        expect(await l2Migrator.merkleSnapshotAddr()).to.equal(
            ethers.constants.AddressZero,
        );
        expect(await l2Migrator.tokenAddr()).to.equal(
            ethers.constants.AddressZero,
        );
      });
    });
  });

  describe('setL1Migrator', () => {
    describe('caller is not admin', () => {
      it('fails to set l1Migrator', async () => {
        const tx = l2Migrator
            .connect(l1AddrEOA)
            .setL1Migrator(notL1MigratorEOA.address);
        await expect(tx).to.be.revertedWith('caller must be Controller owner');
      });
    });

    describe('caller is admin', () => {
      it('sets l1Migrator', async () => {
        const tx = await l2Migrator
            .connect(admin)
            .setL1Migrator(notL1MigratorEOA.address);
        await expect(tx)
            .to.emit(l2Migrator, 'L1MigratorUpdate')
            .withArgs(notL1MigratorEOA.address);
        const l1MigratorAddr = await l2Migrator.l1MigratorAddr();
        expect(l1MigratorAddr).to.equal(notL1MigratorEOA.address);
      });
    });
  });

  describe('setDelegatorPoolImpl', () => {
    describe('caller is not admin', () => {
      it('fails to set delegatorPoolImpl', async () => {
        const tx = l2Migrator
            .connect(l1AddrEOA)
            .setDelegatorPoolImpl(notL1MigratorEOA.address);
        await expect(tx).to.be.revertedWith('caller must be Controller owner');
      });
    });

    describe('caller is admin', () => {
      it('sets delegatorPoolImpl', async () => {
        const tx = await l2Migrator
            .connect(admin)
            .setDelegatorPoolImpl(notL1MigratorEOA.address);
        await expect(tx)
            .to.emit(l2Migrator, 'DelegatorPoolImplUpdate')
            .withArgs(notL1MigratorEOA.address);
        const delegatorPoolImpl = await l2Migrator.delegatorPoolImpl();
        expect(delegatorPoolImpl).to.equal(notL1MigratorEOA.address);
      });
    });
  });

  describe('setClaimStakeEnabled', () => {
    describe('caller is not admin', () => {
      it('fails to set claimStakeEnabled', async () => {
        const tx = l2Migrator.connect(l1AddrEOA).setClaimStakeEnabled(true);
        await expect(tx).to.be.revertedWith('caller must be Controller owner');
      });
    });

    describe('caller is admin', () => {
      it('sets claimStakeEnabled', async () => {
        const tx1 = await l2Migrator.connect(admin).setClaimStakeEnabled(true);
        await expect(tx1)
            .to.emit(l2Migrator, 'ClaimStakeEnabled')
            .withArgs(true);
        expect(await l2Migrator.claimStakeEnabled()).to.be.true;
        const tx2 = await l2Migrator.connect(admin).setClaimStakeEnabled(false);
        await expect(tx2)
            .to.emit(l2Migrator, 'ClaimStakeEnabled')
            .withArgs(false);
        expect(await l2Migrator.claimStakeEnabled()).to.be.false;
      });
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
      await expect(tx).to.revertedWith('DELEGATOR_ALREADY_MIGRATED');
    });

    it('reverts if fee transfer fails', async () => {
      const params = {
        ...mockMigrateDelegatorParams(),
        fees: 300,
      };

      const tx = l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateDelegator(params);
      await expect(tx).to.revertedWith('FINALIZE_DELEGATOR:FAIL_FEE');
    });

    describe('finalizes migration', () => {
      describe('l1Addr == delegate (is orchestrator on L1)', () => {
        it('creates delegator pool', async () => {
          const pendingStake = 500;
          bondingManagerMock.pendingStake.returns(pendingStake);

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

          const deployed: DelegatorPool = await ethers.getContractAt(
              'DelegatorPool',
              delegatorPool,
          );

          expect(await deployed.bondingManager()).to.equal(
              bondingManagerMock.address,
          );

          expect(await deployed.migrator()).to.equal(l2Migrator.address);

          // Check for case where the orchestrator's L2 address is different from its delegate address (which is its L1 address)
          expect(params.delegate).to.not.be.equal(params.l2Addr);

          // Make sure that the orchestrator is staked to it's L2 address and NOT its delegate/L1 address
          expect(tokenMock.approve.atCall(0)).to.be.calledWith(
              bondingManagerMock.address,
              params.stake,
          );
          expect(bondingManagerMock.bondForWithHint.atCall(0)).to.be.calledWith(
              params.stake,
              params.l2Addr,
              params.l2Addr,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
          );

          // Make sure that the delegator pool is staked to the orchestrator's L2 address and NOT its delegate/L1 address
          expect(tokenMock.approve.atCall(1)).to.be.calledWith(
              bondingManagerMock.address,
              params.stake,
          );
          expect(bondingManagerMock.bondForWithHint.atCall(1)).to.be.calledWith(
              params.delegatedStake - params.stake,
              delegatorPool,
              params.l2Addr,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
          );

          await expect(tx)
              .to.emit(deployed, 'DelegatorPoolInitialized')
              .withArgs(
                  bondingManagerMock.address,
                  l2Migrator.address,
                  pendingStake,
              );

          await expect(tx)
              .to.emit(l2Migrator, 'DelegatorPoolCreated')
              .withArgs(params.l1Addr, delegatorPool);

          await expect(tx).to.emit(l2Migrator, 'MigrateDelegatorFinalized');
          // The assertion below does not work until https://github.com/EthWorks/Waffle/issues/245 is fixed
          // .withArgs(seqNo, params)
        });

        it('subtracts claimed delegated stake via claimStake() when staking for delegator pool', async () => {
          const delegator = l2AddrEOA;
          const delegate = l1AddrEOA.address;
          const stake = 50;
          const fees = 0;

          await l2Migrator
              .connect(delegator)
              .claimStake(
                  delegate,
                  stake,
                  fees,
                  [],
                  ethers.constants.AddressZero,
              );

          expect(await l2Migrator.claimedDelegatedStake(delegate)).to.be.equal(
              stake,
          );

          const params = mockMigrateDelegatorParams();
          params.l1Addr = delegate;
          params.l2Addr = delegate;
          params.delegate = delegate;

          bondingManagerMock.bondForWithHint.reset();
          tokenMock.approve.reset();

          await l2Migrator
              .connect(mockL1MigratorL2AliasEOA)
              .finalizeMigrateDelegator(params);

          const delegatorPool = await l2Migrator.delegatorPools(params.l1Addr);
          expect(tokenMock.approve.atCall(1)).to.be.calledWith(
              bondingManagerMock.address,
              params.delegatedStake - params.stake - stake,
          );

          expect(bondingManagerMock.bondForWithHint.atCall(1)).to.be.calledWith(
              params.delegatedStake - params.stake - stake,
              delegatorPool,
              params.delegate,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
          );
        });

        it('subtracts claimed delegated stake via finalizeMigrateDelegator() when staking for delegator pool', async () => {
          const delegator = l2AddrEOA.address;
          const delegate = l1AddrEOA.address;
          const stake = 50;

          const params1 = {
            ...mockMigrateDelegatorParams(),
            l1Addr: delegator,
            l2Addr: delegator,
            delegate,
            stake,
          };
          await l2Migrator
              .connect(mockL1MigratorL2AliasEOA)
              .finalizeMigrateDelegator(params1);

          expect(await l2Migrator.claimedDelegatedStake(delegate)).to.be.equal(
              stake,
          );

          const params2 = {
            ...mockMigrateDelegatorParams(),
            l1Addr: delegate,
            l2Addr: delegate,
            delegate,
          };

          bondingManagerMock.bondForWithHint.reset();
          tokenMock.approve.reset();

          await l2Migrator
              .connect(mockL1MigratorL2AliasEOA)
              .finalizeMigrateDelegator(params2);

          const delegatorPool = await l2Migrator.delegatorPools(params2.l1Addr);
          expect(tokenMock.approve.atCall(1)).to.be.calledWith(
              bondingManagerMock.address,
              params2.delegatedStake - params2.stake - stake,
          );
          expect(bondingManagerMock.bondForWithHint.atCall(1)).to.be.calledWith(
              params2.delegatedStake - params2.stake - stake,
              delegatorPool,
              params2.delegate,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
          );
        });
      });

      describe('l1Addr != delegate (is delegator on L1)', () => {
        it('does not create delegator pool', async () => {
          const params = {
            ...mockMigrateDelegatorParams(),
            l1Addr: l1AddrEOA.address,
            l2Addr: l2AddrEOA.address,
            delegate: l2AddrEOA.address,
          };

          const tx = await l2Migrator
              .connect(mockL1MigratorL2AliasEOA)
              .finalizeMigrateDelegator(params);

          expect(await l2Migrator.delegatorPools(params.l1Addr)).to.be.equal(
              ethers.constants.AddressZero,
          );

          await expect(tx).to.not.emit(l2Migrator, 'DelegatorPoolCreated');
        });

        it('stakes in BondingManager if delegator pool does not exist', async () => {
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

          expect(tokenMock.approve).to.be.calledOnceWith(
              bondingManagerMock.address,
              params.stake,
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

          await expect(tx).to.emit(l2Migrator, 'MigrateDelegatorFinalized');
          // The assertion below does not work until https://github.com/EthWorks/Waffle/issues/245 is fixed
          // .withArgs(seqNo, params)
        });

        it('claims stake from delegator pool if it exists', async () => {
          const paramsDelegate = {
            ...mockMigrateDelegatorParams(),
            l1Addr: l1AddrEOA.address,
            l2Addr: l1AddrEOA.address,
            delegate: l1AddrEOA.address,
          };

          await l2Migrator
              .connect(mockL1MigratorL2AliasEOA)
              .finalizeMigrateDelegator(paramsDelegate);

          const delegatorPoolAddr = await l2Migrator.delegatorPools(
              paramsDelegate.l1Addr,
          );
          expect(delegatorPoolAddr).to.not.be.equal(
              ethers.constants.AddressZero,
          );

          const delegatorPoolMock: FakeContract = await smock.fake(
              'IDelegatorPool',
              {
                address: delegatorPoolAddr,
              },
          );

          const paramsDelegator = {
            ...mockMigrateDelegatorParams(),
            l1Addr: l2AddrEOA.address,
            l2Addr: l2AddrEOA.address,
            delegate: l1AddrEOA.address,
          };

          await l2Migrator
              .connect(mockL1MigratorL2AliasEOA)
              .finalizeMigrateDelegator(paramsDelegator);

          expect(
              await l2Migrator.claimedDelegatedStake(paramsDelegator.delegate),
          ).to.be.equal(paramsDelegate.stake + paramsDelegator.stake);
          expect(delegatorPoolMock.claim).to.be.calledOnceWith(
              l2AddrEOA.address,
              paramsDelegator.stake,
          );
        });
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

      await expect(tx).to.revertedWith('UNBONDING_LOCK_ALREADY_MIGRATED');

      // Middle id migrated
      params.unbondingLockIds = [7, 2, 8];
      tx = l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateUnbondingLocks(params);

      await expect(tx).to.revertedWith('UNBONDING_LOCK_ALREADY_MIGRATED');

      // Last id migrated
      params.unbondingLockIds = [7, 8, 3];
      tx = l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateUnbondingLocks(params);

      await expect(tx).to.revertedWith('UNBONDING_LOCK_ALREADY_MIGRATED');

      // None of the ids have been migrated previously, but the list contains duplicate ids
      params.unbondingLockIds = [11, 11, 12];
      tx = l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateUnbondingLocks(params);

      await expect(tx).to.revertedWith('UNBONDING_LOCK_ALREADY_MIGRATED');
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

      expect(tokenMock.approve).to.be.calledOnceWith(
          bondingManagerMock.address,
          params.total,
      );
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

    it('reverts when L2Migrator balance is insufficient', async () => {
      const tx = l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateSender(mockMigrateSenderParams());
      await expect(tx).to.reverted;
    });

    it('reverts when l1Addr already migrated', async () => {
      await mockL1MigratorEOA.sendTransaction({
        to: l2Migrator.address,
        value: ethers.utils.parseUnits('1', 'ether'),
      });

      await l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateSender(mockMigrateSenderParams());

      const tx = l2Migrator
          .connect(mockL1MigratorL2AliasEOA)
          .finalizeMigrateSender(mockMigrateSenderParams());
      await expect(tx).to.revertedWith('SENDER_ALREADY_MIGRATED');
    });

    it('finalizes migration', async () => {
      await mockL1MigratorEOA.sendTransaction({
        to: l2Migrator.address,
        value: ethers.utils.parseUnits('1', 'ether'),
      });

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

      await expect(tx).to.changeEtherBalance(
          mockTicketBrokerEOA,
          params.deposit + params.reserve,
      );
      await expect(tx).to.changeEtherBalance(
          l2Migrator,
          -(params.deposit + params.reserve),
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
    it('reverts if !claimStakeEnabled', async () => {
      await l2Migrator.connect(admin).setClaimStakeEnabled(false);

      const tx = l2Migrator
          .connect(l1AddrEOA)
          .claimStake(
              ethers.constants.AddressZero,
              0,
              0,
              [],
              ethers.constants.AddressZero,
          );
      await expect(tx).to.revertedWith('CLAIM_STAKE_DISABLED');
    });

    it('reverts for invalid proof', async () => {
      merkleSnapshotMock.verify.returns(false);

      const tx = l2Migrator
          .connect(l1AddrEOA)
          .claimStake(
              ethers.constants.AddressZero,
              0,
              0,
              [],
              ethers.constants.AddressZero,
          );
      await expect(tx).to.revertedWith('CLAIM_STAKE:INVALID_PROOF');
    });

    it('reverts if delegator is already migrated', async () => {
      await l2Migrator
          .connect(l1AddrEOA)
          .claimStake(
              l2AddrEOA.address,
              100,
              0,
              [],
              ethers.constants.AddressZero,
          );

      const tx = l2Migrator
          .connect(l1AddrEOA)
          .claimStake(
              l2AddrEOA.address,
              100,
              0,
              [],
              ethers.constants.AddressZero,
          );
      await expect(tx).to.revertedWith('CLAIM_STAKE:ALREADY_MIGRATED');
    });

    it('reverts if fee transfer fails', async () => {
      const tx = l2Migrator
          .connect(l1AddrEOA)
          .claimStake(
              l2AddrEOA.address,
              100,
              200,
              [],
              ethers.constants.AddressZero,
          );
      await expect(tx).to.be.reverted;
    });

    describe('delegate is null', () => {
      it('does not claim stake or stake in BondingManager', async () => {
        // Simulate a scenario where there is a delegator pool for the null address to make sure
        // that even in that scenario the delegator pool is not called
        const slot = ethers.utils.solidityKeccak256(
            ['uint256', 'uint256'],
            // delegatorPools mapping is at storage slot 9
            [ethers.constants.AddressZero, '9'],
        );

        await network.provider.send('hardhat_setStorageAt', [
          l2Migrator.address,
          slot,
          ethers.utils.hexlify(ethers.utils.zeroPad(l2AddrEOA.address, 32)),
        ]);

        const pool = await l2Migrator.delegatorPools(
            ethers.constants.AddressZero,
        );
        expect(pool).to.be.equal(l2AddrEOA.address);

        const delegatorPoolMock: FakeContract = await smock.fake(
            'IDelegatorPool',
            {
              address: l2AddrEOA.address,
            },
        );

        const delegator = l2AddrEOA;
        const delegate = ethers.constants.AddressZero;
        const stake = 100;
        const fees = 200;

        await mockL1MigratorEOA.sendTransaction({
          to: l2Migrator.address,
          value: ethers.utils.parseUnits('1', 'ether'),
        });

        const tx = await l2Migrator
            .connect(delegator)
            .claimStake(delegate, stake, fees, [], ethers.constants.AddressZero);

        expect(delegatorPoolMock.claim).to.not.be.called;
        expect(bondingManagerMock.bondForWithHint).to.not.be.called;

        await expect(tx).to.changeEtherBalance(delegator, fees);
      });
    });

    describe('claims stake', () => {
      it('claims stake from delegator pool if it exists', async () => {
        const params = mockMigrateDelegatorParams();
        params.l1Addr = l1AddrEOA.address;
        params.l2Addr = l1AddrEOA.address;
        params.delegate = l1AddrEOA.address;

        await l2Migrator
            .connect(mockL1MigratorL2AliasEOA)
            .finalizeMigrateDelegator(params);

        const delegatorPoolAddr = await l2Migrator.delegatorPools(
            params.l1Addr,
        );
        expect(delegatorPoolAddr).to.not.be.equal(ethers.constants.AddressZero);

        const delegatorPoolMock: FakeContract = await smock.fake(
            'IDelegatorPool',
            {
              address: delegatorPoolAddr,
            },
        );

        const delegator = l2AddrEOA;
        const delegate = l1AddrEOA.address;
        const stake = 100;
        const fees = 0;

        expect(await l2Migrator.claimedDelegatedStake(delegate)).to.be.equal(
            params.stake,
        );

        const tx = await l2Migrator
            .connect(delegator)
            .claimStake(delegate, stake, fees, [], ethers.constants.AddressZero);

        expect(await l2Migrator.migratedDelegators(delegator.address)).to.be
            .true;
        expect(await l2Migrator.claimedDelegatedStake(delegate)).to.be.equal(
            params.stake + stake,
        );
        expect(delegatorPoolMock.claim).to.be.calledOnceWith(
            l2AddrEOA.address,
            100,
        );

        await expect(tx)
            .to.emit(l2Migrator, 'StakeClaimed')
            .withArgs(delegator.address, delegate, stake, fees);
      });

      it('stakes in BondingManager if delegator pool does not exist', async () => {
        const delegator = l1AddrEOA;
        const delegate = l2AddrEOA.address;
        const stake = 100;
        const fees = 0;

        expect(await l2Migrator.delegatorPools(delegate)).to.be.equal(
            ethers.constants.AddressZero,
        );
        expect(await l2Migrator.claimedDelegatedStake(delegate)).to.be.equal(0);

        const tx = await l2Migrator
            .connect(delegator)
            .claimStake(delegate, stake, fees, [], ethers.constants.AddressZero);

        expect(await l2Migrator.migratedDelegators(delegator.address)).to.be
            .true;
        expect(await l2Migrator.claimedDelegatedStake(delegate)).to.be.equal(
            stake,
        );
        expect(tokenMock.approve).to.be.calledOnceWith(
            bondingManagerMock.address,
            stake,
        );
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

        const tx = await l2Migrator
            .connect(delegator)
            .claimStake(delegate, stake, fees, [], newDelegate);

        expect(tokenMock.approve).to.be.calledOnceWith(
            bondingManagerMock.address,
            stake,
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
            .withArgs(delegator.address, delegate, stake, fees);
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

        const tx = await l2Migrator
            .connect(delegator)
            .claimStake(delegate, stake, fees, [], ethers.constants.AddressZero);

        await expect(tx).to.changeEtherBalance(delegator, fees);
      });
    });
  });
});
