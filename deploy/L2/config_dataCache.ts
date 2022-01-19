import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, getNamedAccounts} = hre;
  const {execute} = deployments;

  const {deployer} = await getNamedAccounts();

  const l1DataCache = await hre.companionNetworks['l1'].deployments.get(
      'L1LPTDataCache',
  );

  await execute(
      'L2LPTDataCache',
      {from: deployer, log: true},
      'setL1LPTDataCache',
      l1DataCache.address,
  );
};

func.tags = ['L2_DATA_CACHE_CONFIG'];
export default func;
