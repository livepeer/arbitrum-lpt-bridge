import {Signer} from '@ethersproject/abstract-signer';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {expect, use} from 'chai';
import {ethers} from 'hardhat';
import {
  L1LPTGateway__factory,
  L2LPTGateway,
  L2LPTGateway__factory,
  LivepeerToken,
  LivepeerToken__factory,
} from '../../../typechain';
import {getL2SignerFromL1} from '../../utils/messaging';
import {FakeContract, smock} from '@defi-wonderland/smock';

use(smock.matchers);

describe('L2 Gateway', function() {
  let token: LivepeerToken;
  let owner: SignerWithAddress;
  let l2Gateway: L2LPTGateway;
  let sender: SignerWithAddress;
  let receiver: SignerWithAddress;
  let admin: SignerWithAddress;

  // mocks
  let arbSysMock: FakeContract;
  let l2LPTDataCacheMock: FakeContract;
  let mockL2RouterEOA: SignerWithAddress;
  let mockL1GatewayEOA: SignerWithAddress;
  let mockL1GatewayL2Alias: Signer;
  let mockL1LptEOA: SignerWithAddress;
  let mockL2LPTDataCacheEOA: SignerWithAddress;

  const BURNER_ROLE = ethers.utils.solidityKeccak256(
      ['string'],
      ['BURNER_ROLE'],
  );

  const DEFAULT_ADMIN_ROLE = ethers.constants.HashZero;

  beforeEach(async function() {
    [
      owner,
      sender,
      receiver,
      admin,
      mockL2RouterEOA,
      mockL1GatewayEOA,
      mockL1LptEOA,
      mockL2LPTDataCacheEOA,
    ] = await ethers.getSigners();

    const Token: LivepeerToken__factory = await ethers.getContractFactory(
        'LivepeerToken',
    );
    token = await Token.deploy();
    await token.deployed();

    const L2Gateway: L2LPTGateway__factory = await ethers.getContractFactory(
        'L2LPTGateway',
    );
    l2Gateway = await L2Gateway.deploy(
        mockL2RouterEOA.address,
        mockL1LptEOA.address,
        token.address,
        mockL2LPTDataCacheEOA.address,
    );
    await l2Gateway.deployed();

    await token.grantRole(
        ethers.utils.solidityKeccak256(['string'], ['MINTER_ROLE']),
        l2Gateway.address,
    );

    await l2Gateway.grantRole(DEFAULT_ADMIN_ROLE, admin.address);
    await l2Gateway.connect(admin).setCounterpart(mockL1GatewayEOA.address);

    await token.grantRole(BURNER_ROLE, l2Gateway.address);

    mockL1GatewayL2Alias = await getL2SignerFromL1(mockL1GatewayEOA);
    await owner.sendTransaction({
      to: await mockL1GatewayL2Alias.getAddress(),
      value: ethers.utils.parseUnits('1', 'ether'),
    });

    arbSysMock = await smock.fake('IArbSys', {
      address: '0x0000000000000000000000000000000000000064',
    });

    l2LPTDataCacheMock = await smock.fake(
        'contracts/L2/gateway/L2LPTGateway.sol:IL2LPTDataCache',
        {
          address: mockL2LPTDataCacheEOA.address,
        },
    );
  });

  describe('constructor', () => {
    it('sets addresses', async () => {
      expect(await l2Gateway.l2Router()).to.be.equal(mockL2RouterEOA.address);
      expect(await l2Gateway.l2LPTDataCache()).to.be.equal(
          mockL2LPTDataCacheEOA.address,
      );
    });

    describe('l2 token', () => {
      it('should return correct l2 token', async function() {
        const lpt = await l2Gateway.calculateL2TokenAddress(
            mockL1LptEOA.address,
        );
        expect(lpt).to.equal(token.address);
      });

      // eslint-disable-next-line
      it('should return 0 address when called with incorrect l1 token', async function () {
        const lpt = await l2Gateway.calculateL2TokenAddress(
            ethers.utils.hexlify(ethers.utils.randomBytes(20)),
        );
        expect(lpt).to.equal('0x0000000000000000000000000000000000000000');
      });
    });

    describe('l1 counterpart', () => {
      it('should return correct l1 counterpart', async function() {
        const counterpart = await l2Gateway.counterpartGateway();
        expect(counterpart).to.equal(mockL1GatewayEOA.address);
      });
    });

    describe('Pausable', () => {
      it('gateway should be paused on deployment', async function() {
        const isPaused = await l2Gateway.paused();
        expect(isPaused).to.be.true;
      });
    });
  });

  describe('setCounterpart', () => {
    const newAddress = ethers.utils.getAddress(
        ethers.utils.solidityKeccak256(['string'], ['newAddress']).slice(0, 42),
    );

    describe('caller not admin', () => {
      it('should fail to change counterpart address', async function() {
        const tx = l2Gateway.connect(sender).setCounterpart(newAddress);
        await expect(tx).to.be.revertedWith(
            // eslint-disable-next-line
          `AccessControl: account ${sender.address.toLocaleLowerCase()} is missing role ${DEFAULT_ADMIN_ROLE}`
        );
      });
    });

    describe('caller is admin', () => {
      it('should change counterpart address', async function() {
        const tx = await l2Gateway.connect(admin).setCounterpart(newAddress);
        await expect(tx)
            .to.emit(l2Gateway, 'L1CounterpartUpdate')
            .withArgs(newAddress);
        const counterpart = await l2Gateway.counterpartGateway();
        expect(counterpart).to.equal(newAddress);
      });
    });
  });

  describe('finalizeInboundTransfer', () => {
    const depositAmount = 100;
    const defaultData = ethers.utils.defaultAbiCoder.encode(
        ['bytes', 'bytes'],
        ['0x12', '0x'],
    );

    describe('when gateway is not paused', () => {
      beforeEach(async function() {
        await l2Gateway.connect(admin).unpause();
      });

      describe('caller is not l1 gateway router (aliased)', () => {
        it('should revert if not relaying message from l1Gateway', async () => {
          const tx = l2Gateway
              .connect(owner)
              .finalizeInboundTransfer(
                  mockL1LptEOA.address,
                  sender.address,
                  sender.address,
                  depositAmount,
                  defaultData,
              );

          await expect(tx).to.be.revertedWith('ONLY_COUNTERPART_GATEWAY');
        });

        it('should revert when called directly by l1 counterpart', async () => {
          // this should fail b/c we require address translation
          const tx = l2Gateway
              .connect(mockL1GatewayEOA)
              .finalizeInboundTransfer(
                  mockL1LptEOA.address,
                  sender.address,
                  sender.address,
                  depositAmount,
                  defaultData,
              );

          await expect(tx).to.be.revertedWith('ONLY_COUNTERPART_GATEWAY');
        });
      });

      describe('caller is l1 gateway router (aliased)', () => {
        it('should revert when withdrawing not supported tokens', async () => {
          const tx = l2Gateway
              .connect(mockL1GatewayL2Alias)
              .finalizeInboundTransfer(
                  ethers.utils.hexlify(ethers.utils.randomBytes(20)),
                  sender.address,
                  sender.address,
                  depositAmount,
                  defaultData,
              );
          await expect(tx).to.be.revertedWith('TOKEN_NOT_LPT');
        });

        it('should revert when LPT minting access was revoked', async () => {
          const MINTER_ROLE = ethers.utils.solidityKeccak256(
              ['string'],
              ['MINTER_ROLE'],
          );
          await token.revokeRole(MINTER_ROLE, l2Gateway.address);

          const tx = l2Gateway
              .connect(mockL1GatewayL2Alias)
              .finalizeInboundTransfer(
                  mockL1LptEOA.address,
                  sender.address,
                  sender.address,
                  depositAmount,
                  defaultData,
              );

          await expect(tx).to.be.revertedWith(
              // eslint-disable-next-line
            `AccessControl: account ${l2Gateway.address.toLowerCase()} is missing role ${MINTER_ROLE}`
          );
        });

        it('mints tokens', async () => {
          const tx = await l2Gateway
              .connect(mockL1GatewayL2Alias)
              .finalizeInboundTransfer(
                  mockL1LptEOA.address,
                  sender.address,
                  sender.address,
                  depositAmount,
                  defaultData,
              );

          expect(await token.balanceOf(sender.address)).to.equal(depositAmount);
          expect(await token.totalSupply()).to.equal(depositAmount);
          await expect(tx)
              .to.emit(l2Gateway, 'DepositFinalized')
              .withArgs(
                  mockL1LptEOA.address,
                  sender.address,
                  sender.address,
                  depositAmount,
              );
        });

        it('mints tokens for a 3rd party', async () => {
          const tx = await l2Gateway
              .connect(mockL1GatewayL2Alias)
              .finalizeInboundTransfer(
                  mockL1LptEOA.address,
                  sender.address,
                  receiver.address,
                  depositAmount,
                  defaultData,
              );

          expect(await token.balanceOf(receiver.address)).to.be.eq(
              depositAmount,
          );
          expect(await token.totalSupply()).to.be.eq(depositAmount);
          await expect(tx)
              .to.emit(l2Gateway, 'DepositFinalized')
              .withArgs(
                  mockL1LptEOA.address,
                  sender.address,
                  receiver.address,
                  depositAmount,
              );
        });

        it('calls increaseL2SupplyFromL1() on L2LPTDataCache', async () => {
          await l2Gateway
              .connect(mockL1GatewayL2Alias)
              .finalizeInboundTransfer(
                  mockL1LptEOA.address,
                  sender.address,
                  receiver.address,
                  depositAmount,
                  defaultData,
              );

          expect(
              l2LPTDataCacheMock.increaseL2SupplyFromL1,
          ).to.be.calledOnceWith(depositAmount);
        });
      });
    });

    describe('when gateway is paused', () => {
      it('should allow minting', async () => {
        const tx = await l2Gateway
            .connect(mockL1GatewayL2Alias)
            .finalizeInboundTransfer(
                mockL1LptEOA.address,
                sender.address,
                sender.address,
                depositAmount,
                defaultData,
            );

        expect(await token.balanceOf(sender.address)).to.be.eq(depositAmount);
        expect(await token.totalSupply()).to.be.eq(depositAmount);
        await expect(tx)
            .to.emit(l2Gateway, 'DepositFinalized')
            .withArgs(
                mockL1LptEOA.address,
                sender.address,
                sender.address,
                depositAmount,
            );
      });
    });
  });

  describe('outboundTransfer', () => {
    const withdrawAmount = 100;
    const defaultData = '0x';
    const defaultDataWithNotEmptyCallHookData = '0x12';
    const expectedWithdrawalId = 0;
    const initialTotalL2Supply = 3000;

    beforeEach(async function() {
      await token.grantRole(
          ethers.utils.solidityKeccak256(['string'], ['MINTER_ROLE']),
          owner.address,
      );
      await token.connect(owner).mint(sender.address, initialTotalL2Supply);
      await l2Gateway.connect(admin).unpause();
    });

    describe('when gateway is paused', async function() {
      beforeEach(async function() {
        await l2Gateway.connect(admin).pause();
      });

      it('should fail to tranfer', async () => {
        await expect(
            l2Gateway['outboundTransfer(address,address,uint256,bytes)'](
                mockL1LptEOA.address,
                sender.address,
                withdrawAmount,
                defaultData,
            ),
        ).to.be.revertedWith('Pausable: paused');
      });
    });

    describe('when gateway is not paused', async function() {
      it('should revert when called with a different token', async () => {
        const tx = l2Gateway['outboundTransfer(address,address,uint256,bytes)'](
            token.address,
            sender.address,
            withdrawAmount,
            defaultData,
        );
        await expect(tx).to.be.revertedWith('TOKEN_NOT_LPT');
      });

      it('should revert when amount zero', async () => {
        const tx = l2Gateway['outboundTransfer(address,address,uint256,bytes)'](
            mockL1LptEOA.address,
            sender.address,
            0,
            defaultData,
        );
        await expect(tx).to.be.revertedWith('INVALID_ZERO_AMOUNT');
      });

      it('should revert when allowance is insufficient', async () => {
        const tx = l2Gateway
            .connect(sender)
            ['outboundTransfer(address,address,uint256,bytes)'](
                mockL1LptEOA.address,
                sender.address,
                initialTotalL2Supply,
                defaultData,
            );
        await expect(tx).to.be.revertedWith(
            'ERC20: burn amount exceeds allowance',
        );
      });

      it('should revert when funds are too low', async () => {
        await token
            .connect(sender)
            .approve(l2Gateway.address, initialTotalL2Supply + 100);

        const tx = l2Gateway
            .connect(sender)
            ['outboundTransfer(address,address,uint256,bytes)'](
                mockL1LptEOA.address,
                sender.address,
                initialTotalL2Supply + 100,
                defaultData,
            );
        await expect(tx).to.be.revertedWith(
            'ERC20: burn amount exceeds balance',
        );
      });

      it('should revert when called with callHookData', async () => {
        const tx = l2Gateway['outboundTransfer(address,address,uint256,bytes)'](
            mockL1LptEOA.address,
            sender.address,
            withdrawAmount,
            defaultDataWithNotEmptyCallHookData,
        );
        await expect(tx).to.be.revertedWith('CALL_HOOK_DATA_NOT_ALLOWED');
      });

      it('should revert when bridge doesnt have minter role', async () => {
        // remove burn permissions
        await token.revokeRole(BURNER_ROLE, l2Gateway.address);

        const tx = l2Gateway['outboundTransfer(address,address,uint256,bytes)'](
            mockL1LptEOA.address,
            sender.address,
            withdrawAmount,
            defaultData,
        );

        await expect(tx).to.be.revertedWith(
            // eslint-disable-next-line
          `AccessControl: account ${l2Gateway.address.toLowerCase()} is missing role ${BURNER_ROLE}`
        );
      });

      it('sends message to L1 and burns tokens', async () => {
        await token.connect(sender).approve(l2Gateway.address, withdrawAmount);
        const tx = await l2Gateway
            .connect(sender)
            ['outboundTransfer(address,address,uint256,bytes)'](
                mockL1LptEOA.address,
                sender.address,
                withdrawAmount,
                defaultData,
            );

        expect(await token.balanceOf(sender.address)).to.be.eq(
            initialTotalL2Supply - withdrawAmount,
        );
        expect(await token.totalSupply()).to.be.eq(
            initialTotalL2Supply - withdrawAmount,
        );
        await expect(tx)
            .to.emit(l2Gateway, 'WithdrawalInitiated')
            .withArgs(
                mockL1LptEOA.address,
                sender.address,
                sender.address,
                expectedWithdrawalId,
                expectedWithdrawalId,
                withdrawAmount,
            );

        const calldata = new L1LPTGateway__factory(
            owner,
        ).interface.encodeFunctionData('finalizeInboundTransfer', [
          mockL1LptEOA.address,
          sender.address,
          sender.address,
          withdrawAmount,
          ethers.utils.defaultAbiCoder.encode(
              ['uint256', 'bytes'],
              [expectedWithdrawalId, defaultData],
          ),
        ]);
        expect(arbSysMock.sendTxToL1).to.be.calledOnceWith(
            mockL1GatewayEOA.address,
            calldata,
        );
      });

      it('sends message to L1 and burns tokens for 3rd party', async () => {
        await token.connect(sender).approve(l2Gateway.address, withdrawAmount);
        const tx = await l2Gateway
            .connect(sender)
            ['outboundTransfer(address,address,uint256,bytes)'](
                mockL1LptEOA.address,
                receiver.address,
                withdrawAmount,
                defaultData,
            );

        expect(await token.balanceOf(sender.address)).to.be.eq(
            initialTotalL2Supply - withdrawAmount,
        );
        expect(await token.balanceOf(receiver.address)).to.be.eq(0);
        expect(await token.totalSupply()).to.be.eq(
            initialTotalL2Supply - withdrawAmount,
        );
        await expect(tx)
            .to.emit(l2Gateway, 'WithdrawalInitiated')
            .withArgs(
                mockL1LptEOA.address,
                sender.address,
                receiver.address,
                expectedWithdrawalId,
                expectedWithdrawalId,
                withdrawAmount,
            );

        const calldata = new L1LPTGateway__factory(
            owner,
        ).interface.encodeFunctionData('finalizeInboundTransfer', [
          mockL1LptEOA.address,
          sender.address,
          receiver.address,
          withdrawAmount,
          ethers.utils.defaultAbiCoder.encode(
              ['uint256', 'bytes'],
              [expectedWithdrawalId, defaultData],
          ),
        ]);
        expect(arbSysMock.sendTxToL1).to.be.calledOnceWith(
            mockL1GatewayEOA.address,
            calldata,
        );
      });

      // eslint-disable-next-line
      it('sends message to L1 and burns tokens when called through router', async () => {
        const routerEncodedData = ethers.utils.defaultAbiCoder.encode(
            ['address', 'bytes'],
            [sender.address, defaultData],
        );

        await token.connect(sender).approve(l2Gateway.address, withdrawAmount);
        // Router calls outboundTransfer() with two additional uint256 params that are unused and set to 0
        const tx = await l2Gateway
            .connect(mockL2RouterEOA)
            ['outboundTransfer(address,address,uint256,uint256,uint256,bytes)'](
                mockL1LptEOA.address,
                receiver.address,
                withdrawAmount,
                0,
                0,
                routerEncodedData,
            );

        expect(await token.balanceOf(sender.address)).to.be.eq(
            initialTotalL2Supply - withdrawAmount,
        );
        expect(await token.balanceOf(receiver.address)).to.be.eq(0);
        expect(await token.totalSupply()).to.be.eq(
            initialTotalL2Supply - withdrawAmount,
        );
        await expect(tx)
            .to.emit(l2Gateway, 'WithdrawalInitiated')
            .withArgs(
                mockL1LptEOA.address,
                sender.address,
                receiver.address,
                expectedWithdrawalId,
                expectedWithdrawalId,
                withdrawAmount,
            );

        const calldata = new L1LPTGateway__factory(
            owner,
        ).interface.encodeFunctionData('finalizeInboundTransfer', [
          mockL1LptEOA.address,
          sender.address,
          receiver.address,
          withdrawAmount,
          ethers.utils.defaultAbiCoder.encode(
              ['uint256', 'bytes'],
              [expectedWithdrawalId, defaultData],
          ),
        ]);
        expect(arbSysMock.sendTxToL1).to.be.calledOnceWith(
            mockL1GatewayEOA.address,
            calldata,
        );
      });

      it('calls decreaseL2SupplyFromL1() on L2LPTDataCache', async () => {
        await token.connect(sender).approve(l2Gateway.address, withdrawAmount);
        await l2Gateway
            .connect(sender)
            ['outboundTransfer(address,address,uint256,bytes)'](
                mockL1LptEOA.address,
                sender.address,
                withdrawAmount,
                defaultData,
            );

        expect(l2LPTDataCacheMock.decreaseL2SupplyFromL1).to.be.calledOnceWith(
            withdrawAmount,
        );
      });
    });
  });
});
