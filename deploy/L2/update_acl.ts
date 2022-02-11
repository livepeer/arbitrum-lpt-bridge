import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';
import {ACL} from '../constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, ethers, getNamedAccounts} = hre;
  const {execute} = deployments;

  const {deployer} = await getNamedAccounts();

  const ADMIN_ROLE = ethers.constants.HashZero;

  // LPT
  await execute(
      'LivepeerToken',
      {from: deployer, log: true},
      'grantRole',
      ADMIN_ROLE,
      ACL[hre.network.name].livepeerToken.admin,
  );
  await execute(
      'LivepeerToken',
      {from: deployer, log: true},
      'revokeRole',
      ADMIN_ROLE,
      deployer,
  );

  // L2LPTGateway
  await execute(
      'L2LPTGateway',
      {from: deployer, log: true},
      'grantRole',
      ADMIN_ROLE,
      ACL[hre.network.name].l2LPTGateway.admin,
  );
  await execute(
      'L2LPTGateway',
      {from: deployer, log: true},
      'revokeRole',
      ADMIN_ROLE,
      deployer,
  );

  // L2LPTDataCache
  await execute(
      'L2LPTDataCache',
      {from: deployer, log: true},
      'transferOwnership',
      ACL[hre.network.name].l2LPTDataCache.admin,
  );
};

func.tags = ['L2_ACL_UPDATE'];
export default func;
