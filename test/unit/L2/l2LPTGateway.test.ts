import {Signer} from '@ethersproject/abstract-signer';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {expect} from 'chai';
import {ethers} from 'hardhat';
import {
  L2LPTGateway,
  L2LPTGateway__factory,
  LivepeerToken,
  LivepeerToken__factory,
} from '../../../typechain';
import {getL2SignerFromL1} from '../../utils/messaging';

describe('L2 Gateway', function() {
  let token: LivepeerToken;
  let owner: SignerWithAddress;
  let l2Gateway: L2LPTGateway;
  let sender: SignerWithAddress;
  let receiver: SignerWithAddress;
  let governor: SignerWithAddress;

  // mocks
  let mockL2RouterEOA: SignerWithAddress;
  let mockL1GatewayEOA: SignerWithAddress;
  let mockL1GatewayL2Alias: Signer;
  let mockL1LptEOA: SignerWithAddress;

  beforeEach(async function() {
    [
      owner,
      sender,
      receiver,
      governor,
      mockL2RouterEOA,
      mockL1GatewayEOA,
      mockL1LptEOA,
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
        mockL1GatewayEOA.address,
        mockL1LptEOA.address,
        token.address,
    );
    await l2Gateway.deployed();

    await token.grantRole(
        ethers.utils.solidityKeccak256(['string'], ['MINTER_ROLE']),
        l2Gateway.address,
    );

    const GOVERNOR_ROLE = ethers.utils.solidityKeccak256(
        ['string'],
        ['GOVERNOR_ROLE'],
    );
    await l2Gateway.grantRole(GOVERNOR_ROLE, governor.address);

    mockL1GatewayL2Alias = await getL2SignerFromL1(mockL1GatewayEOA);
    await owner.sendTransaction({
      to: await mockL1GatewayL2Alias.getAddress(),
      value: ethers.utils.parseUnits('1', 'ether'),
    });
  });

  it('should correctly set token', async function() {
    const lpt = await l2Gateway.l2Lpt();
    expect(lpt).to.equal(token.address);
  });

  describe('finalizeInboundTransfer', () => {
    const depositAmount = 100;
    const defaultData = ethers.utils.defaultAbiCoder.encode(
        ['bytes', 'bytes'],
        ['0x12', '0x'],
    );

    describe('when gateway is not paused', () => {
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
          await expect(
              l2Gateway
                  .connect(mockL1GatewayL2Alias)
                  .finalizeInboundTransfer(
                      ethers.utils.hexlify(ethers.utils.randomBytes(20)),
                      sender.address,
                      sender.address,
                      depositAmount,
                      defaultData,
                  ),
          ).to.be.revertedWith('TOKEN_NOT_LPT');
        });

        it('should revert when DAI minting access was revoked', async () => {
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
      });
    });

    describe('when gateway is paused', () => {
      beforeEach(async function() {
        await l2Gateway.connect(governor).pause();
      });

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
});
