import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, getNamedAccounts} = hre;
  const {execute} = deployments;

  const {deployer} = await getNamedAccounts();

  await execute('L1Migrator', {from: deployer, log: true}, 'unpause');
};

func.tags = ['L1_MIGRATOR_UNPAUSE'];
export default func;
