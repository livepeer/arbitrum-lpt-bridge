import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {expect} from 'chai';
import {ethers} from 'hardhat';

import {
  L1LPTEscrow,
  L1LPTEscrow__factory,
  LivepeerToken,
  LivepeerToken__factory,
  MockSpender,
  MockSpender__factory,
} from '../../../typechain';

describe('L1Escrow', () => {
  let owner: SignerWithAddress;
  let notOwner: SignerWithAddress;
  let spender: SignerWithAddress;
  let token: LivepeerToken;
  let escrow: L1LPTEscrow;

  const allowanceLimit = 100;

  beforeEach(async function() {
    [owner, notOwner, spender] = await ethers.getSigners();

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

    it('reverts when called revoke', async () => {
      const tx = escrow
          .connect(notOwner)
          .revoke(token.address, spender.address);

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

  describe('transactions', async function() {
    let mockSpender: MockSpender;
    const initialSupply = 10000;

    beforeEach(async function() {
      await token.grantRole(
          ethers.utils.solidityKeccak256(['string'], ['MINTER_ROLE']),
          owner.address,
      );
      await token.mint(escrow.address, initialSupply);
      mockSpender = await new MockSpender__factory(owner).deploy();
    });

    describe('spender does not have allowance', () => {
      it('should revert on token transfer', async () => {
        const tx = mockSpender.transferTokens(
            escrow.address,
            token.address,
            1000,
        );

        await expect(tx).to.be.revertedWith(
            'ERC20: transfer amount exceeds allowance',
        );
      });
    });

    describe('spender has allowance', () => {
      const amount = 1000;

      beforeEach(async function() {
        await escrow.allow(mockSpender.address);
        await escrow.approve(token.address, mockSpender.address, amount);
      });

      it('should revert if amount exceeds balance', async () => {
        const tx = mockSpender.transferTokens(
            escrow.address,
            token.address,
            initialSupply + 10,
        );

        await expect(tx).to.be.revertedWith(
            'ERC20: transfer amount exceeds balance',
        );
      });

      it('should revert if amount exceeds allowance', async () => {
        const tx = mockSpender.transferTokens(
            escrow.address,
            token.address,
            amount + 100,
        );

        await expect(tx).to.be.revertedWith(
            'ERC20: transfer amount exceeds allowance',
        );
      });

      it('should transfer tokens to itself', async () => {
        const spenderInitialBalance = await token.balanceOf(
            mockSpender.address,
        );
        const escrowInitialBalance = await token.balanceOf(escrow.address);

        await mockSpender.transferTokens(escrow.address, token.address, amount);

        expect(await token.balanceOf(mockSpender.address)).to.equal(
            spenderInitialBalance.add(amount),
        );
        expect(await token.balanceOf(escrow.address)).to.equal(
            escrowInitialBalance.sub(amount),
        );
      });

      describe('spender access was modified', () => {
        describe('deny', () => {
          beforeEach(async function() {
            await escrow.deny(mockSpender.address);
          });

          it('should transfer tokens to itself', async () => {
            const spenderInitialBalance = await token.balanceOf(
                mockSpender.address,
            );
            const escrowInitialBalance = await token.balanceOf(escrow.address);

            await mockSpender.transferTokens(
                escrow.address,
                token.address,
                amount,
            );

            expect(await token.balanceOf(mockSpender.address)).to.equal(
                spenderInitialBalance.add(amount),
            );
            expect(await token.balanceOf(escrow.address)).to.equal(
                escrowInitialBalance.sub(amount),
            );
          });
        });

        describe('revoke', () => {
          beforeEach(async function() {
            await escrow.revoke(token.address, mockSpender.address);
          });

          it('should revert on token transfer', async () => {
            const tx = mockSpender.transferTokens(
                escrow.address,
                token.address,
                1000,
            );

            await expect(tx).to.be.revertedWith(
                'ERC20: transfer amount exceeds allowance',
            );
          });
        });
      });
    });
  });
});
