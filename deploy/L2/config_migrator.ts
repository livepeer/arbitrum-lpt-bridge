import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, ethers} = hre;

  const signers = await ethers.getSigners();

  const l1Migrator = await hre.companionNetworks['l1'].deployments.get(
      'L1Migrator',
  );

  const delegatorPool = await deployments.get('DelegatorPool');

  const l2MigratorProxyDeploy = await deployments.get('L2MigratorProxy');
  const l2Migrator = await ethers.getContractAt('L2Migrator', l2MigratorProxyDeploy.address);

  await (await l2Migrator.connect(signers[0]).initialize(l1Migrator.address, delegatorPool.address)).wait();
};

func.tags = ['L2_MIGRATOR_CONFIG'];
export default func;
