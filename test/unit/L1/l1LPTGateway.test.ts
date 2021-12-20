import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {expect} from 'chai';
import {ethers} from 'hardhat';
import {ARBITRUM_NETWORK} from '../../../deploy/constants';
import {
  L1Escrow,
  L1Escrow__factory,
  L1LPTGateway,
  L1LPTGateway__factory,
  LivepeerToken,
  LivepeerToken__factory,
} from '../../../typechain';

describe('L1 Gateway', function() {
  let token: LivepeerToken;
  let escrow: L1Escrow;
  let l1Gateway: L1LPTGateway;
  let owner: SignerWithAddress;

  const {l1GatewayRouter, inbox} = ARBITRUM_NETWORK.rinkeby;
  const L2_COUNTERPART = ethers.constants.AddressZero;
  const L2_LPT = ethers.constants.AddressZero;

  beforeEach(async function() {
    const signers = await ethers.getSigners();
    owner = signers[0];

    const Token: LivepeerToken__factory = await ethers.getContractFactory(
        'LivepeerToken',
    );
    token = await Token.deploy();
    await token.deployed();

    const Escrow: L1Escrow__factory = await ethers.getContractFactory(
        'L1Escrow',
    );
    escrow = await Escrow.deploy();
    await escrow.deployed();

    const L1Gateway: L1LPTGateway__factory = await ethers.getContractFactory(
        'L1LPTGateway',
    );

    l1Gateway = await L1Gateway.deploy(
        l1GatewayRouter,
        L2_COUNTERPART,
        escrow.address,
        token.address,
        L2_LPT,
        inbox,
    );
    await l1Gateway.deployed();
  });

  it('should correctly set token', async function() {
    const lpt = await l1Gateway.connect(owner).l1Lpt();
    expect(lpt).to.equal(token.address);
  });
});
