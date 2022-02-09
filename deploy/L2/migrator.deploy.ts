import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';
import {ethers} from 'hardhat';
import {getControllerAddress} from '../helpers';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;

  const {deployer} = await getNamedAccounts();

  const controllerAddr = getControllerAddress('L2');
  const targetContractId = ethers.utils.solidityKeccak256(
      ['string'],
      ['L2MigratorTarget'],
  );

  // deploy proxy
  const L2MigratorProxy = await deploy('ManagerProxy', {
    from: deployer,
    args: [controllerAddr, targetContractId],
    log: true,
  });
  deployments.save('L2MigratorProxy', L2MigratorProxy);

  // deploy target
  const L2MigratorTarget = await deploy('L2Migrator', {
    from: deployer,
    args: [controllerAddr],
    log: true,
  });
  deployments.save('L2MigratorTarget', L2MigratorTarget);
};

func.tags = ['L2_MIGRATOR'];
export default func;
