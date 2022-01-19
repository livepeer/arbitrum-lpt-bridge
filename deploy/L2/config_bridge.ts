import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, getNamedAccounts} = hre;
  const {execute} = deployments;

  const {deployer} = await getNamedAccounts();

  const l1Gateway = await hre.companionNetworks['l1'].deployments.get(
      'L1LPTGateway',
  );

  const l2Gateway = await hre.deployments.get('L2LPTGateway');

  await execute(
      'L2LPTGateway',
      {from: deployer, log: true},
      'setCounterpart',
      l1Gateway.address,
  );

  await execute(
      'L2LPTDataCache',
      {from: deployer, log: true},
      'setL2LPTGateway',
      l2Gateway.address,
  );
};

func.tags = ['L2_GATEWAY_INIT'];
export default func;
