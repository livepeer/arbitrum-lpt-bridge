import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {expect} from 'chai';
import {ethers} from 'hardhat';
import {ARBITRUM_NETWORK, L1_LPT} from '../../../deploy/constants';
import {
  L2LPTGateway,
  L2LPTGateway__factory,
  LivepeerToken,
  LivepeerToken__factory,
} from '../../../typechain';

describe('L2 Gateway', function() {
  let token: LivepeerToken;
  let l2Gateway: L2LPTGateway;
  let owner: SignerWithAddress;

  const {l2GatewayRouter} = ARBITRUM_NETWORK.rinkeby;
  const L1_COUNTERPART = ethers.constants.AddressZero;

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
    l2Gateway = await L2Gateway.deploy(
        l2GatewayRouter,
        L1_COUNTERPART,
        L1_LPT,
        token.address,
    );
    await l2Gateway.deployed();
  });

  it('should correctly set token', async function() {
    const lpt = await l2Gateway.connect(owner).l2Lpt();
    expect(lpt).to.equal(token.address);
  });
});
