import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';
import {ACL} from '../constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, ethers, getNamedAccounts} = hre;
  const {execute} = deployments;

  const {deployer} = await getNamedAccounts();

  const ADMIN_ROLE = ethers.constants.HashZero;

  // L1Escrow
  await execute(
      'L1Escrow',
      {from: deployer, log: true},
      'grantRole',
      ADMIN_ROLE,
      ACL[hre.network.name].l1Escrow.admin,
  );
  await execute(
      'L1Escrow',
      {from: deployer, log: true},
      'revokeRole',
      ADMIN_ROLE,
      deployer,
  );

  // L1Migrator
  await execute(
      'L1Migrator',
      {from: deployer, log: true},
      'grantRole',
      ADMIN_ROLE,
      ACL[hre.network.name].l1Migrator.admin,
  );
  await execute(
      'L1Migrator',
      {from: deployer, log: true},
      'grantRole',
      ADMIN_ROLE,
      ACL[hre.network.name].l1Migrator.tempAdmin,
  );
  await execute(
      'L1Migrator',
      {from: deployer, log: true},
      'revokeRole',
      ADMIN_ROLE,
      deployer,
  );

  // L1LPTGateway
  await execute(
      'L1LPTGateway',
      {from: deployer, log: true},
      'grantRole',
      ADMIN_ROLE,
      ACL[hre.network.name].l1LPTGateway.admin,
  );
  await execute(
      'L1LPTGateway',
      {from: deployer, log: true},
      'revokeRole',
      ADMIN_ROLE,
      deployer,
  );
};

func.tags = ['L1_ACL_UPDATE'];
export default func;
