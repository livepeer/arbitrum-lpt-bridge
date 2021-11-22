import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';
import {ARBITRUM_NETWORK} from '../constants';
import {ethers} from 'hardhat';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, getNamedAccounts} = hre;
  const {deploy, execute} = deployments;

  const {deployer} = await getNamedAccounts();

  const l1LPT = await deployments.get('L1_LPT');
  const l2LPT = await hre.companionNetworks['l2'].deployments.get('L2_LPT');
  const escrow = await deployments.get('L1LPTEscrow');

  const l1Gateway = await deploy('L1LPTGateway', {
    from: deployer,
    args: [
      ARBITRUM_NETWORK.rinkeby.l1GatewayRouter,
      escrow.address,
      l1LPT.address,
      l2LPT.address,
      ARBITRUM_NETWORK.rinkeby.inbox,
    ],
    log: true,
  });

  await execute(
      'L1LPTEscrow',
      {from: deployer, log: true},
      'allow',
      l1Gateway.address,
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
func.dependencies = ['L1_LPT', 'L1_ESCROW'];
export default func;
