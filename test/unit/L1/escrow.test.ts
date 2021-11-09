import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {expect} from 'chai';
import {ethers} from 'hardhat';

import {
  L1LPTEscrow,
  L1LPTEscrow__factory,
  LivepeerToken,
  LivepeerToken__factory,
} from '../../../typechain';

describe('L1Escrow', () => {
  let notOwner: SignerWithAddress;
  let spender: SignerWithAddress;
  let token: LivepeerToken;
  let escrow: L1LPTEscrow;

  const allowanceLimit = 100;

  beforeEach(async function() {
    const signers = await ethers.getSigners();
    notOwner = signers[1];
    spender = signers[2];

    const Token: LivepeerToken__factory = await ethers.getContractFactory(
        'LivepeerToken',
    );
    token = await Token.deploy();
    await token.deployed();

    const Escrow: L1LPTEscrow__factory = await ethers.getContractFactory(
        'L1LPTEscrow',
    );
    escrow = await Escrow.deploy();
    await escrow.deployed();
  });

  describe('caller is not authorized', () => {
    it('reverts when called approve', async () => {
      const tx = escrow
          .connect(notOwner)
          .approve(token.address, spender.address, allowanceLimit);

      await expect(tx).to.be.revertedWith('NOT_AUTHORIZED');
    });

    it('reverts when called allow', async () => {
      const tx = escrow.connect(notOwner).allow(spender.address);

      await expect(tx).to.be.revertedWith('NOT_AUTHORIZED');
    });

    it('reverts when called deny', async () => {
      const tx = escrow.connect(notOwner).deny(spender.address);

      await expect(tx).to.be.revertedWith('NOT_AUTHORIZED');
    });
  });

  describe('caller is authorized', () => {
    describe('approve', async function() {
      it('sets approval on erc20 tokens', async () => {
        const initialAllowance = await token.allowance(
            escrow.address,
            spender.address,
        );
        expect(initialAllowance).to.equal(0);

        await escrow.approve(token.address, spender.address, allowanceLimit);

        const allowance = await token.allowance(
            escrow.address,
            spender.address,
        );
        expect(allowance).to.equal(allowanceLimit);
      });

      it('emits Approval event', async () => {
        const tx = escrow.approve(
            token.address,
            spender.address,
            allowanceLimit,
        );

        await expect(tx)
            .to.emit(escrow, 'Approve')
            .withArgs(token.address, spender.address, allowanceLimit);
      });
    });

    describe('allow', async function() {
      it('adds user to whitelist', async () => {
        const isAllowedInitial = await escrow.allowed(spender.address);
        expect(isAllowedInitial).to.be.false;

        await escrow.allow(spender.address);

        const isAllowed = await escrow.allowed(spender.address);
        expect(isAllowed).to.be.true;
      });

      it('emits Allow event', async () => {
        const tx = escrow.allow(spender.address);

        await expect(tx).to.emit(escrow, 'Allow').withArgs(spender.address);
      });
    });

    describe('deny', async function() {
      beforeEach(async function() {
        await escrow.allow(spender.address);
      });

      it('adds user to whitelist', async () => {
        const isAllowedInitial = await escrow.allowed(spender.address);
        expect(isAllowedInitial).to.be.true;

        await escrow.deny(spender.address);

        const isAllowed = await escrow.allowed(spender.address);
        expect(isAllowed).to.be.false;
      });

      it('emits Allow event', async () => {
        const tx = escrow.deny(spender.address);

        await expect(tx).to.emit(escrow, 'Deny').withArgs(spender.address);
      });
    });
  });
});
