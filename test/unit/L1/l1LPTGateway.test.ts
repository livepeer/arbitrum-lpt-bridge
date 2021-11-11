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
  let inboxMock: FakeContract;
  let owner: SignerWithAddress;
  let governor: SignerWithAddress;
  let inboxImpersonator: SignerWithAddress;
  let l1RouterImpersonator: SignerWithAddress;
  let l2DaiGatewayEOA: SignerWithAddress;

  const initialTotalL1Supply = 3000;

  beforeEach(async function() {
    [
      owner,
      governor,
      inboxImpersonator,
      l1RouterImpersonator,
      l2DaiGatewayEOA,
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
        l1RouterImpersonator.address,
        l2DaiGatewayEOA.address,
        escrow.address,
        token.address,
        l2DaiGatewayEOA.address,
        inboxImpersonator.address,
    );
    await l1Gateway.deployed();

    await token.approve(l1Gateway.address, initialTotalL1Supply);

    const GOVERNOR_ROLE = ethers.utils.solidityKeccak256(
        ['string'],
        ['GOVERNOR_ROLE'],
    );
    await l1Gateway.grantRole(GOVERNOR_ROLE, governor.address);

    inboxMock = await smock.fake(InboxABI.abi, {
      address: inboxImpersonator.address,
    });
  });

  it('should correctly set token', async function() {
    const lpt = await l1Gateway.l1Lpt();
    expect(lpt).to.equal(token.address);
  });

  describe('outboundTransfer', async function() {
    const depositAmount = 100;
    const defaultGas = 42;
    const defaultEthValue = ethers.utils.parseEther('0.1');
    const maxSubmissionCost = 7;

    const emptyCallHookData = '0x';
    const defaultData = ethers.utils.defaultAbiCoder.encode(
        ['uint256', 'bytes'],
        [maxSubmissionCost, emptyCallHookData],
    );

    // const notEmptyCallHookData = '0x12';
    // const defaultDataWithNotEmptyCallHookData =
    //   ethers.utils.defaultAbiCoder.encode(
    //       ['uint256', 'bytes'],
    //       [maxSubmissionCost, notEmptyCallHookData],
    //   );

    describe('when gateway is paused', async function() {
      beforeEach(async function() {
        await l1Gateway.connect(governor).pause();
      });

      it('should fail to tranfer', async function() {
        const tx = l1Gateway.outboundTransfer(
            token.address,
            owner.address,
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
      it('should fail to tranfer non LPT token', async function() {
        const tx = l1Gateway.outboundTransfer(
            ethers.utils.hexlify(ethers.utils.randomBytes(20)),
            owner.address,
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

      it('escrows funds and sends message to L2', async () => {
        const defaultInboxBalance = await inboxImpersonator.getBalance();

        await token.approve(l1Gateway.address, depositAmount);

        const depositTx = await l1Gateway.outboundTransfer(
            token.address,
            owner.address,
            depositAmount,
            defaultGas,
            0,
            defaultData,
            {
              value: defaultEthValue,
            },
        );
        const depositCallToMessenger = inboxMock.createRetryableTicket;

        const expectedDepositId = 0;
        const l2EncodedData = ethers.utils.defaultAbiCoder.encode(
            ['bytes', 'bytes'],
            ['0x', emptyCallHookData],
        );
        const expectedDepositXDomainCallData = new L2LPTGateway__factory(
            owner,
        ).interface.encodeFunctionData('finalizeInboundTransfer', [
          token.address,
          owner.address,
          owner.address,
          depositAmount,
          l2EncodedData,
        ]);

        expect(await token.balanceOf(owner.address)).to.be.eq(
            initialTotalL1Supply - depositAmount,
        );
        expect(await token.balanceOf(l1Gateway.address)).to.be.eq(0);
        expect(await token.balanceOf(escrow.address)).to.be.eq(depositAmount);

        expect(await inboxImpersonator.getBalance()).to.equal(
            defaultInboxBalance.add(defaultEthValue),
        );

        expect(depositCallToMessenger).to.be.calledOnceWith(
            l2DaiGatewayEOA.address,
            0,
            maxSubmissionCost,
            owner.address,
            owner.address,
            defaultGas,
            0,
            expectedDepositXDomainCallData,
        );

        await expect(depositTx)
            .to.emit(l1Gateway, 'DepositInitiated')
            .withArgs(
                token.address,
                owner.address,
                owner.address,
                expectedDepositId,
                depositAmount,
            );
        await expect(depositTx)
            .to.emit(l1Gateway, 'TxToL2')
            .withArgs(
                owner.address,
                l2DaiGatewayEOA.address,
                expectedDepositId,
                expectedDepositXDomainCallData,
            );
      });
    });
  });
});
