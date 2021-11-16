import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {expect, use} from 'chai';

import {ethers} from 'hardhat';
import {
  L1LPTEscrow,
  L1LPTEscrow__factory,
  L1LPTGateway,
  L1LPTGateway__factory,
  L2LPTGateway__factory,
  LivepeerToken,
  LivepeerToken__factory,
} from '../../../typechain';
import {FakeContract, smock} from '@defi-wonderland/smock';
import * as InboxABI from '../../utils/abis/Inbox.json';

use(smock.matchers);

describe('L1 LPT Gateway', function() {
  let token: LivepeerToken;
  let escrow: L1LPTEscrow;
  let l1Gateway: L1LPTGateway;
  let owner: SignerWithAddress;
  let sender: SignerWithAddress;
  let receiver: SignerWithAddress;
  let governor: SignerWithAddress;

  // mocks
  let inboxMock: FakeContract;
  let mockInboxEOA: SignerWithAddress;
  let mockL1RouterEOA: SignerWithAddress;
  let mockL2GatewayEOA: SignerWithAddress;
  let mockL2LptEOA: SignerWithAddress;

  const initialTotalL1Supply = 3000;
  const depositAmount = 100;

  beforeEach(async function() {
    [
      owner,
      sender,
      receiver,
      governor,
      mockInboxEOA,
      mockL1RouterEOA,
      mockL2GatewayEOA,
      mockL2LptEOA,
    ] = await ethers.getSigners();

    const Token: LivepeerToken__factory = await ethers.getContractFactory(
        'LivepeerToken',
    );
    token = await Token.deploy();
    await token.deployed();

    await token.grantRole(
        ethers.utils.solidityKeccak256(['string'], ['MINTER_ROLE']),
        owner.address,
    );
    await token.mint(owner.address, initialTotalL1Supply);

    const Escrow: L1LPTEscrow__factory = await ethers.getContractFactory(
        'L1LPTEscrow',
    );
    escrow = await Escrow.deploy();
    await escrow.deployed();

    const L1Gateway: L1LPTGateway__factory = await ethers.getContractFactory(
        'L1LPTGateway',
    );

    l1Gateway = await L1Gateway.deploy(
        mockL1RouterEOA.address,
        mockL2GatewayEOA.address,
        escrow.address,
        token.address,
        mockL2LptEOA.address,
        mockInboxEOA.address,
    );
    await l1Gateway.deployed();

    await token.transfer(sender.address, initialTotalL1Supply);
    await token.connect(sender).approve(l1Gateway.address, depositAmount);

    const GOVERNOR_ROLE = ethers.utils.solidityKeccak256(
        ['string'],
        ['GOVERNOR_ROLE'],
    );
    await l1Gateway.grantRole(GOVERNOR_ROLE, governor.address);

    inboxMock = await smock.fake(InboxABI.abi, {
      address: mockInboxEOA.address,
    });
  });

  it('should correctly set token', async function() {
    const lpt = await l1Gateway.l1Lpt();
    expect(lpt).to.equal(token.address);
  });

  describe('outboundTransfer', async function() {
    const defaultGas = 42;
    const defaultEthValue = ethers.utils.parseEther('0.1');
    const maxSubmissionCost = 7;

    const emptyCallHookData = '0x';
    const defaultData = ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'bytes'],
        [maxSubmissionCost, emptyCallHookData],
    );

    const notEmptyCallHookData = '0x12';
    const defaultDataWithNotEmptyCallHookData =
      ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'bytes'],
          [maxSubmissionCost, notEmptyCallHookData],
      );

    describe('when gateway is paused', async function() {
      beforeEach(async function() {
        await l1Gateway.connect(governor).pause();
      });

      it('should fail to tranfer', async function() {
        const tx = l1Gateway
            .connect(sender)
            .outboundTransfer(
                token.address,
                sender.address,
                depositAmount,
                defaultGas,
                0,
                defaultData,
                {
                  value: defaultEthValue,
                },
            );

        await expect(tx).to.be.revertedWith('Pausable: paused');
      });
    });

    describe('when gateway is not paused', async function() {
      it('reverts when tranferring non LPT token', async function() {
        const tx = l1Gateway
            .connect(sender)
            .outboundTransfer(
                ethers.utils.hexlify(ethers.utils.randomBytes(20)),
                sender.address,
                depositAmount,
                defaultGas,
                0,
                defaultData,
                {
                  value: defaultEthValue,
                },
            );

        await expect(tx).to.be.revertedWith('TOKEN_NOT_LPT');
      });

      it('reverts when approval is too low', async () => {
        const tx = l1Gateway
            .connect(sender)
            .outboundTransfer(
                token.address,
                sender.address,
                depositAmount + 100,
                defaultGas,
                0,
                defaultData,
            );
        await expect(tx).to.be.revertedWith(
            'ERC20: transfer amount exceeds allowance',
        );
      });

      it('reverts when funds too low', async () => {
        const tx = l1Gateway
            .connect(sender)
            .outboundTransfer(
                token.address,
                sender.address,
                initialTotalL1Supply + 100,
                defaultGas,
                0,
                defaultData,
            );
        await expect(tx).to.be.revertedWith(
            'ERC20: transfer amount exceeds balance',
        );
      });

      it('reverts when called with hook calldata', async () => {
        const tx = l1Gateway
            .connect(sender)
            .outboundTransfer(
                token.address,
                sender.address,
                depositAmount,
                defaultGas,
                0,
                defaultDataWithNotEmptyCallHookData,
            );
        await expect(tx).to.be.revertedWith('CALL_HOOK_DATA_NOT_ALLOWED');
      });

      it('escrows funds and sends message to L2', async () => {
        const defaultInboxBalance = await mockInboxEOA.getBalance();

        const depositTx = await l1Gateway
            .connect(sender)
            .outboundTransfer(
                token.address,
                sender.address,
                depositAmount,
                defaultGas,
                0,
                defaultData,
                {
                  value: defaultEthValue,
                },
            );

        const expectedDepositId = 0;
        const l2EncodedData = ethers.utils.defaultAbiCoder.encode(
            ['bytes', 'bytes'],
            ['0x', emptyCallHookData],
        );
        const expectedL2calldata = new L2LPTGateway__factory(
            owner,
        ).interface.encodeFunctionData('finalizeInboundTransfer', [
          token.address,
          sender.address,
          sender.address,
          depositAmount,
          l2EncodedData,
        ]);

        expect(await token.balanceOf(sender.address)).to.equal(
            initialTotalL1Supply - depositAmount,
        );
        expect(await token.balanceOf(l1Gateway.address)).to.equal(0);
        expect(await token.balanceOf(escrow.address)).to.equal(depositAmount);

        expect(await mockInboxEOA.getBalance()).to.equal(
            defaultInboxBalance.add(defaultEthValue),
        );

        // 1. destAddr
        // 2. l2CallValue
        // 3. maxSubmissionCost
        // 4. excessFeeRefundAddress
        // 5. callValueRefundAddress
        // 6. maxGas
        // 7. gasPriceBid
        // 8. data
        expect(inboxMock.createRetryableTicket).to.be.calledOnceWith(
            mockL2GatewayEOA.address,
            0,
            maxSubmissionCost,
            sender.address,
            sender.address,
            defaultGas,
            0,
            expectedL2calldata,
        );

        await expect(depositTx)
            .to.emit(l1Gateway, 'DepositInitiated')
            .withArgs(
                token.address,
                sender.address,
                sender.address,
                expectedDepositId,
                depositAmount,
            );
        await expect(depositTx)
            .to.emit(l1Gateway, 'TxToL2')
            .withArgs(
                sender.address,
                mockL2GatewayEOA.address,
                expectedDepositId,
                expectedL2calldata,
            );
      });

      it('escrows funds and sends message to L2 for third party', async () => {
        const defaultInboxBalance = await mockInboxEOA.getBalance();

        const depositTx = await l1Gateway
            .connect(sender)
            .outboundTransfer(
                token.address,
                receiver.address,
                depositAmount,
                defaultGas,
                0,
                defaultData,
                {
                  value: defaultEthValue,
                },
            );

        const expectedDepositId = 0;
        const l2EncodedData = ethers.utils.defaultAbiCoder.encode(
            ['bytes', 'bytes'],
            ['0x', emptyCallHookData],
        );
        const expectedL2calldata = new L2LPTGateway__factory(
            owner,
        ).interface.encodeFunctionData('finalizeInboundTransfer', [
          token.address,
          sender.address,
          receiver.address,
          depositAmount,
          l2EncodedData,
        ]);

        expect(await token.balanceOf(sender.address)).to.equal(
            initialTotalL1Supply - depositAmount,
        );
        expect(await token.balanceOf(receiver.address)).to.equal(0);
        expect(await token.balanceOf(l1Gateway.address)).to.equal(0);
        expect(await token.balanceOf(escrow.address)).to.equal(depositAmount);

        expect(await mockInboxEOA.getBalance()).to.equal(
            defaultInboxBalance.add(defaultEthValue),
        );

        // 1. destAddr
        // 2. l2CallValue
        // 3. maxSubmissionCost
        // 4. excessFeeRefundAddress
        // 5. callValueRefundAddress
        // 6. maxGas
        // 7. gasPriceBid
        // 8. data
        expect(inboxMock.createRetryableTicket).to.be.calledOnceWith(
            mockL2GatewayEOA.address,
            0,
            maxSubmissionCost,
            sender.address,
            sender.address,
            defaultGas,
            0,
            expectedL2calldata,
        );

        await expect(depositTx)
            .to.emit(l1Gateway, 'DepositInitiated')
            .withArgs(
                token.address,
                sender.address,
                receiver.address,
                expectedDepositId,
                depositAmount,
            );
        await expect(depositTx)
            .to.emit(l1Gateway, 'TxToL2')
            .withArgs(
                sender.address,
                mockL2GatewayEOA.address,
                expectedDepositId,
                expectedL2calldata,
            );
      });

      it('decodes data correctly when called via router', async () => {
        const routerEncodedData = ethers.utils.defaultAbiCoder.encode(
            ['address', 'bytes'],
            [sender.address, defaultData],
        );

        await token.approve(l1Gateway.address, depositAmount);
        const depositTx = await l1Gateway
            .connect(mockL1RouterEOA)
            .outboundTransfer(
                token.address,
                receiver.address,
                depositAmount,
                defaultGas,
                0,
                routerEncodedData,
            );
        const depositCallToMessenger = inboxMock.createRetryableTicket;

        const expectedDepositId = 0;
        const l2EncodedData = ethers.utils.defaultAbiCoder.encode(
            ['bytes', 'bytes'],
            ['0x', emptyCallHookData],
        );
        const expectedL2calldata = new L2LPTGateway__factory(
            owner,
        ).interface.encodeFunctionData('finalizeInboundTransfer', [
          token.address,
          sender.address,
          receiver.address,
          depositAmount,
          l2EncodedData,
        ]);

        expect(await token.balanceOf(sender.address)).to.equal(
            initialTotalL1Supply - depositAmount,
        );
        expect(await token.balanceOf(l1Gateway.address)).to.equal(0);
        expect(await token.balanceOf(escrow.address)).to.equal(depositAmount);

        // 1. destAddr
        // 2. l2CallValue
        // 3. maxSubmissionCost
        // 4. excessFeeRefundAddress
        // 5. callValueRefundAddress
        // 6. maxGas
        // 7. gasPriceBid
        // 8. data
        expect(depositCallToMessenger).to.be.calledOnceWith(
            mockL2GatewayEOA.address,
            0,
            maxSubmissionCost,
            sender.address,
            sender.address,
            defaultGas,
            0,
            expectedL2calldata,
        );

        await expect(depositTx)
            .to.emit(l1Gateway, 'DepositInitiated')
            .withArgs(
                token.address,
                sender.address,
                receiver.address,
                expectedDepositId,
                depositAmount,
            );
        await expect(depositTx)
            .to.emit(l1Gateway, 'TxToL2')
            .withArgs(
                sender.address,
                mockL2GatewayEOA.address,
                expectedDepositId,
                expectedL2calldata,
            );
      });
    });
  });
});
