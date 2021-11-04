import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {expect} from 'chai';
import {ethers} from 'hardhat';
import {
  L2LPTGateway,
  L2LPTGateway__factory,
  LivepeerToken,
  LivepeerToken__factory,
} from '../../typechain';

describe('L2 Gateway', function() {
  let token: LivepeerToken;
  let l2Gateway: L2LPTGateway;
  let owner: SignerWithAddress;

  beforeEach(async function() {
    const signers = await ethers.getSigners();
    owner = signers[0];

    const Token: LivepeerToken__factory = await ethers.getContractFactory(
        'LivepeerToken',
    );
    token = await Token.deploy();
    await token.deployed();

    const L2Gateway: L2LPTGateway__factory = await ethers.getContractFactory(
        'L2LPTGateway',
    );
    l2Gateway = await L2Gateway.deploy(token.address);
    await l2Gateway.deployed();
  });

  it('should correctly set token', async function() {
    const lpt = await l2Gateway.connect(owner).token();
    expect(lpt).to.equal(token.address);
  });
});
