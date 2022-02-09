import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';
import {getController, getGitHeadCommitHash} from '../helpers';
import {ethers} from 'hardhat';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, getNamedAccounts} = hre;
  const {execute} = deployments;

  const {deployer} = await getNamedAccounts();

  const signer = await ethers.getSigners();
  const controller = await getController(signer[0], 'L2');

  // register proxy address
  const l2MigratorProxy = await hre.deployments.get('L2MigratorProxy');

  await controller.setContractInfo(
      ethers.utils.solidityKeccak256(['string'], ['L2MigratorProxy']),
      l2MigratorProxy.address,
      await getGitHeadCommitHash(),
  );

  // register target address
  const l2MigratorTarget = await hre.deployments.get('L2MigratorTarget');

  await controller.setContractInfo(
      ethers.utils.solidityKeccak256(['string'], ['L2MigratorTarget']),
      l2MigratorTarget.address,
      await getGitHeadCommitHash(),
  );

  const l1Migrator = await hre.companionNetworks['l1'].deployments.get(
      'L1Migrator',
  );
  const delegatorPool = await hre.deployments.get('DelegatorPool');

  await execute(
      'L2MigratorProxy',
      {from: deployer, log: true},
      'initialize',
      l1Migrator.address,
      delegatorPool.address,
  );
};

func.tags = ['L2_MIGRATOR_CONFIG'];
export default func;
