import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';
import {ethers} from 'hardhat';
import {getController, getGitHeadCommitHash} from '../helpers';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;

  const {deployer} = await getNamedAccounts();

  const signers = await ethers.getSigners();

  const controller = await getController(signers[0], 'L2');

  const targetID = ethers.utils.solidityKeccak256(['string'], ['L2MigratorTarget']);
  const target = await deploy('L2Migrator', {
    from: deployer,
    args: [
      controller.address,
    ],
    log: true,
  });

  const proxyID = ethers.utils.solidityKeccak256(['string'], ['L2Migrator']);
  const proxy = await deploy('ManagerProxy', {
    from: deployer,
    args: [
      controller.address,
      targetID,
    ],
    log: true,
  });

  await deployments.save('L2MigratorTarget', target);
  await deployments.save('L2MigratorProxy', proxy);

  const gitCommitHash = await getGitHeadCommitHash();
  await (
    await controller.setContractInfo(proxyID, proxy.address, gitCommitHash)
  ).wait();

  await (
    await controller.setContractInfo(targetID, target.address, gitCommitHash)
  ).wait();
};

func.tags = ['L2_MIGRATOR'];
export default func;
