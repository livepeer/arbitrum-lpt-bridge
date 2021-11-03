import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {expect} from 'chai';
import {ethers} from 'hardhat';
import {LivepeerToken, LivepeerToken__factory} from '../typechain';

describe('LivepeerToken', function() {
  let token: LivepeerToken;
  let owner: SignerWithAddress;
  let notOwner: SignerWithAddress;

  beforeEach(async function() {
    const signers = await ethers.getSigners();
    owner = signers[0];
    notOwner = signers[1];

    const Token: LivepeerToken__factory = await ethers.getContractFactory(
        'LivepeerToken',
    );
    token = await Token.deploy();
    await token.deployed();
  });

  it('should match deployment params', async function() {
    const tokenName = await token.name();
    expect(tokenName).to.equal('Livepeer Token');

    const tokenSymbol = await token.symbol();
    expect(tokenSymbol).to.equal('LPT');

    const tokenOwner = await token.owner();
    expect(tokenOwner).to.equal(owner.address);
  });

  describe('mint', async function() {
    it('should fail to mint if not owner', async function() {
      const tx = token
          .connect(notOwner)
          .mint(notOwner.address, ethers.utils.parseEther('10000'));

      await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should mint tokens', async function() {
      const amount = ethers.utils.parseEther('10000');
      const balance = await token.balanceOf(owner.address);

      await token.mint(owner.address, amount);

      const newBalance = await token.balanceOf(owner.address);
      expect(newBalance).to.equal(balance.add(amount));
    });

    it('should mint to another address', async function() {
      const amount = ethers.utils.parseEther('10000');
      const balance = await token.balanceOf(notOwner.address);

      await token.mint(notOwner.address, amount);

      const newBalance = await token.balanceOf(notOwner.address);
      expect(newBalance).to.equal(balance.add(amount));
    });
  });

  describe('burn', async function() {
    beforeEach(async function() {
      const amount = ethers.utils.parseEther('10000');
      await token.mint(owner.address, amount);
    });

    it('should burn tokens', async function() {
      const amount = ethers.utils.parseEther('5000');
      const balance = await token.balanceOf(owner.address);

      await token.burn(amount);

      const newBalance = await token.balanceOf(owner.address);
      expect(newBalance).to.equal(balance.sub(amount));
    });
  });
});
