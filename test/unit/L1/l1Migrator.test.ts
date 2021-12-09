import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {expect, use} from 'chai';

import {ethers} from 'hardhat';
import {
  L1Migrator,
  L1Migrator__factory,
  IL2Migrator__factory,
} from '../../../typechain';
import {FakeContract, smock} from '@defi-wonderland/smock';

use(smock.matchers);

describe('L1Migrator', function() {
  let l1Migrator: L1Migrator;

  let l1EOA: SignerWithAddress;
  let notL1EOA: SignerWithAddress;

  // mocks
  let inboxMock: FakeContract;
  let outboxMock: FakeContract;
  let bridgeMock: FakeContract;
  let bondingManagerMock: FakeContract;
  let ticketBrokerMock: FakeContract;
  let mockInboxEOA: SignerWithAddress;
  let mockOutboxEOA: SignerWithAddress;
  let mockBridgeEOA: SignerWithAddress;
  let mockBondingManagerEOA: SignerWithAddress;
  let mockTicketBrokerEOA: SignerWithAddress;
  let mockL2MigratorEOA: SignerWithAddress;

  class L1MigratorSigner {
    signer: SignerWithAddress
    l1Migrator: string
    chainId: number

    constructor(signer: SignerWithAddress, l1Migrator: string, chainId: number) {
      this.signer = signer;
      this.l1Migrator = l1Migrator;
      this.chainId = chainId;
    }

    signMigrateDelegator(l1Addr: string, l2Addr: string): Promise<string> {
      const types = {
        MigrateDelegator: [
          {name: 'l1Addr', type: 'address'},
          {name: 'l2Addr', type: 'address'},
        ],
      };

      return this.signer._signTypedData(this.domain(), types, {l1Addr, l2Addr});
    }

    signMigrateSender(l1Addr: string, l2Addr: string): Promise<string> {
      const types = {
        MigrateSender: [
          {name: 'l1Addr', type: 'address'},
          {name: 'l2Addr', type: 'address'},
        ],
      };

      return this.signer._signTypedData(this.domain(), types, {l1Addr, l2Addr});
    }

    domain(): any {
      return {
        name: 'Livepeer L1Migrator',
        version: '1',
        chainId: this.chainId,
        verifyingContract: this.l1Migrator,
      };
    }
  }

  beforeEach(async function() {
    [
      l1EOA,
      notL1EOA,
      mockInboxEOA,
      mockOutboxEOA,
      mockBridgeEOA,
      mockBondingManagerEOA,
      mockTicketBrokerEOA,
      mockL2MigratorEOA,
    ] = await ethers.getSigners();

    const L1Migrator: L1Migrator__factory = await ethers.getContractFactory('L1Migrator');
    l1Migrator = await L1Migrator.deploy(
        mockInboxEOA.address,
        mockBondingManagerEOA.address,
        mockTicketBrokerEOA.address,
        mockL2MigratorEOA.address,
    );
    await l1Migrator.deployed();

    inboxMock = await smock.fake('IInbox', {
      address: mockInboxEOA.address,
    });

    outboxMock = await smock.fake('IOutbox', {
      address: mockOutboxEOA.address,
    });

    bridgeMock = await smock.fake('IBridge', {
      address: mockBridgeEOA.address,
    });

    bondingManagerMock = await smock.fake('IBondingManager', {
      address: mockBondingManagerEOA.address,
    });

    ticketBrokerMock = await smock.fake('ITicketBroker', {
      address: mockTicketBrokerEOA.address,
    });

    inboxMock.bridge.returns(bridgeMock.address);
    bridgeMock.activeOutbox.returns(outboxMock.address);
  });

  describe('constructor', () => {
    it('sets addresses', async () => {
      const inboxAddr = await l1Migrator.inbox();
      expect(inboxAddr).to.equal(mockInboxEOA.address);

      const bondingManagerAddr = await l1Migrator.bondingManagerAddr();
      expect(bondingManagerAddr).to.equal(mockBondingManagerEOA.address);

      const ticketBrokerAddr = await l1Migrator.ticketBrokerAddr();
      expect(ticketBrokerAddr).to.equal(mockTicketBrokerEOA.address);

      const l2MigratorAddr = await l1Migrator.l2MigratorAddr();
      expect(l2MigratorAddr).to.equal(mockL2MigratorEOA.address);
    });
  });

  describe('migrateDelegator', () => {
    it('reverts for null l2Addr', async () => {
      const tx = l1Migrator.connect(l1EOA).migrateDelegator(
          l1EOA.address,
          ethers.constants.AddressZero,
          '0x',
          0,
          0,
          0,
      );
      await expect(tx).to.be.revertedWith('L1Migrator#requireValidMigration: INVALID_L2_ADDR');
    });

    it('reverts for failed auth', async () => {
      // Invalid msg.sender + invalid non-null signature
      const sig = await notL1EOA.signMessage('foo');
      let tx = l1Migrator.connect(notL1EOA).migrateDelegator(
          l1EOA.address,
          l1EOA.address,
          sig,
          0,
          0,
          0,
      );
      await expect(tx).to.be.revertedWith('L1Migrator#requireValidMigration: FAIL_AUTH');

      // Invalid msg.sender + null signature
      tx = l1Migrator.connect(notL1EOA).migrateDelegator(
          l1EOA.address,
          l1EOA.address,
          '0x',
          0,
          0,
          0,
      );
      await expect(tx).to.be.revertedWith('L1Migrator#requireValidMigration: FAIL_AUTH');
    });

    it('does not revert for successful auth', async () => {
      // Valid msg.sender
      let tx = l1Migrator.connect(l1EOA).migrateDelegator(
          l1EOA.address,
          l1EOA.address,
          '0x',
          0,
          0,
          0,
      );
      await expect(tx).to.not.reverted;

      // Invalid msg.sender + valid signature
      const network = await ethers.provider.getNetwork();
      const l1MigratorSigner = new L1MigratorSigner(l1EOA, l1Migrator.address, network.chainId);
      const sig = await l1MigratorSigner.signMigrateDelegator(l1EOA.address, l1EOA.address);
      tx = l1Migrator.connect(notL1EOA).migrateDelegator(
          l1EOA.address,
          l1EOA.address,
          sig,
          0,
          0,
          0,
      );
      await expect(tx).to.not.reverted;
    });

    it('reads BondingManager state and creates a retryable ticket', async () => {
      const seqNo = 7;
      const stake = 100;
      const fees = 200;
      const delegatedStake = 300;
      const delegate = notL1EOA.address;

      inboxMock.createRetryableTicket.returns(seqNo);
      bondingManagerMock.pendingStake.returns(stake);
      bondingManagerMock.pendingFees.returns(fees);
      bondingManagerMock.getDelegator.returns([
        0,
        0,
        delegate,
        delegatedStake,
        0,
        0,
        0,
      ]);

      const maxGas = 111;
      const gasPriceBid = 222;
      const maxSubmissionCost = 333;

      // createRetryableTicket()
      const migrateDelegatorParams = {
        l1Addr: l1EOA.address,
        l2Addr: l1EOA.address,
        stake,
        delegatedStake,
        fees,
        delegate,
      };
      const l2Calldata = IL2Migrator__factory.createInterface().encodeFunctionData(
          'finalizeMigrateDelegator',
          [migrateDelegatorParams],
      );

      const tx = await l1Migrator.connect(l1EOA).migrateDelegator(
          l1EOA.address,
          l1EOA.address,
          '0x',
          maxGas,
          gasPriceBid,
          maxSubmissionCost,
      );

      expect(inboxMock.createRetryableTicket).to.be.calledOnceWith(
          mockL2MigratorEOA.address,
          0,
          maxSubmissionCost,
          l1EOA.address,
          l1EOA.address,
          maxGas,
          gasPriceBid,
          l2Calldata,
      );

      // MigrateDelegatorInitiated Event
      await expect(tx)
          .to.emit(l1Migrator, 'MigrateDelegatorInitiated');
      // The assertion below does not work until https://github.com/EthWorks/Waffle/issues/245 is fixed
      // .withArgs(seqNo, migrateDelegatorParams)
    });
  });

  describe('migrateSender', () => {
    it('reverts for null l2Addr', async () => {
      const tx = l1Migrator.connect(l1EOA).migrateSender(
          l1EOA.address,
          ethers.constants.AddressZero,
          '0x',
          0,
          0,
          0,
      );
      await expect(tx).to.be.revertedWith('L1Migrator#requireValidMigration: INVALID_L2_ADDR');
    });

    it('reverts for failed auth', async () => {
      // Invalid msg.sender + invalid non-null signature
      const sig = await notL1EOA.signMessage('foo');
      let tx = l1Migrator.connect(notL1EOA).migrateSender(
          l1EOA.address,
          l1EOA.address,
          sig,
          0,
          0,
          0,
      );
      await expect(tx).to.be.revertedWith('L1Migrator#requireValidMigration: FAIL_AUTH');

      // Invalid msg.sender + null signature
      tx = l1Migrator.connect(notL1EOA).migrateSender(
          l1EOA.address,
          l1EOA.address,
          '0x',
          0,
          0,
          0,
      );
      await expect(tx).to.be.revertedWith('L1Migrator#requireValidMigration: FAIL_AUTH');
    });

    it('does not revert for successful auth', async () => {
      // Valid msg.sender
      let tx = l1Migrator.connect(l1EOA).migrateSender(
          l1EOA.address,
          l1EOA.address,
          '0x',
          0,
          0,
          0,
      );
      await expect(tx).to.not.reverted;

      // Invalid msg.sender + valid signature
      const network = await ethers.provider.getNetwork();
      const l1MigratorSigner = new L1MigratorSigner(l1EOA, l1Migrator.address, network.chainId);
      const sig = await l1MigratorSigner.signMigrateSender(l1EOA.address, l1EOA.address);
      tx = l1Migrator.connect(notL1EOA).migrateSender(
          l1EOA.address,
          l1EOA.address,
          sig,
          0,
          0,
          0,
      );
      await expect(tx).to.not.reverted;
    });

    it('reads TicketBroker state and creates a retryable ticket', async () => {
      const seqNo = 7;
      const deposit = 100;
      const reserve = 200;

      inboxMock.createRetryableTicket.returns(seqNo);
      ticketBrokerMock.getSenderInfo.returns([
        {
          deposit,
          withdrawRound: 0,
        },
        {
          fundsRemaining: reserve,
          claimedInCurrentRound: 0,
        },
      ]);

      const maxGas = 111;
      const gasPriceBid = 222;
      const maxSubmissionCost = 333;

      // createRetryableTicket()
      const migrateSenderParams = {
        l1Addr: l1EOA.address,
        l2Addr: l1EOA.address,
        deposit,
        reserve,
      };
      const l2Calldata = IL2Migrator__factory.createInterface().encodeFunctionData(
          'finalizeMigrateSender',
          [migrateSenderParams],
      );

      const tx = await l1Migrator.connect(l1EOA).migrateSender(
          l1EOA.address,
          l1EOA.address,
          '0x',
          maxGas,
          gasPriceBid,
          maxSubmissionCost,
      );

      expect(inboxMock.createRetryableTicket).to.be.calledOnceWith(
          mockL2MigratorEOA.address,
          0,
          maxSubmissionCost,
          l1EOA.address,
          l1EOA.address,
          maxGas,
          gasPriceBid,
          l2Calldata,
      );

      // MigrateSenderInitiated Event
      await expect(tx)
          .to.emit(l1Migrator, 'MigrateSenderInitiated');
      // The assertion below does not work until https://github.com/EthWorks/Waffle/issues/245 is fixed
      // .withArgs(seqNo, migrateSenderParams)
    });
  });
});