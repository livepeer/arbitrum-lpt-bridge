import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {expect} from 'chai';
import {ethers} from 'hardhat';
import {
  L1LPTGateway,
  L1LPTGateway__factory,
  LivepeerToken,
  LivepeerToken__factory,
} from '../../typechain';

describe('L1 Gateway', function() {
  let token: LivepeerToken;
  let l1Gateway: L1LPTGateway;
  let owner: SignerWithAddress;

  beforeEach(async function() {
    const signers = await ethers.getSigners();
    owner = signers[0];

    const Token: LivepeerToken__factory = await ethers.getContractFactory(
        'LivepeerToken',
    );
    token = await Token.deploy();
    await token.deployed();

    const L1Gateway: L1LPTGateway__factory = await ethers.getContractFactory(
        'L1LPTGateway',
    );
    l1Gateway = await L1Gateway.deploy(token.address);
    await l1Gateway.deployed();
  });

  it('should correctly set token', async function() {
    const lpt = await l1Gateway.connect(owner).token();
    expect(lpt).to.equal(token.address);
  });
});
