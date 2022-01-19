import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';
import {ARBITRUM_NETWORK} from '../constants';
import {ethers} from 'hardhat';
import {getAddress} from '../helpers';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, getNamedAccounts} = hre;
  const {deploy, execute} = deployments;

  const {deployer} = await getNamedAccounts();

  const l1LPT = await getAddress(ethers.provider, 'LivepeerToken', 'L1');
  const l2provider = new ethers.providers.JsonRpcProvider(
      process.env.ARB_RINKEBY_URL,
  );
  const l2LPT = await getAddress(l2provider, 'LivepeerToken', 'L2');
  const escrow = await deployments.get('L1Escrow');

  const l1Gateway = await deploy('L1LPTGateway', {
    from: deployer,
    args: [
      ARBITRUM_NETWORK.rinkeby.l1GatewayRouter,
      escrow.address,
      l1LPT,
      l2LPT,
      ARBITRUM_NETWORK.rinkeby.inbox,
    ],
    log: true,
  });

  const DEFAULT_ADMIN_ROLE = ethers.utils.solidityKeccak256(
      ['string'],
      ['DEFAULT_ADMIN_ROLE'],
  );
  await execute(
      'L1Escrow',
      {from: deployer, log: true},
      'grantRole',
      DEFAULT_ADMIN_ROLE,
      deployer,
  );

  await execute(
      'L1Escrow',
      {from: deployer, log: true},
      'approve',
      l1LPT,
      l1Gateway.address,
      ethers.constants.MaxUint256,
  );

  const GOVERNOR_ROLE = ethers.utils.solidityKeccak256(
      ['string'],
      ['GOVERNOR_ROLE'],
  );
  await execute(
      'L1LPTGateway',
      {from: deployer, log: true},
      'grantRole',
      GOVERNOR_ROLE,
      deployer,
  );
};

func.tags = ['L1_GATEWAY'];
export default func;
