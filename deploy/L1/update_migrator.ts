import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';
import {getController} from '../helpers';
import {ethers} from 'hardhat';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, getNamedAccounts} = hre;
  const {execute} = deployments;

  const {deployer} = await getNamedAccounts();

  const controller = await getController(ethers.provider, 'L1');

  const minter = await controller.getContract(
      ethers.utils.solidityKeccak256(['string'], ['Minter']),
  );

  await execute(
      'L1Migrator',
      {from: deployer, log: true},
      'setBridgeMinter',
      minter,
  );
};

func.tags = ['L1_MIGRATOR_MINTER_UPDATE'];
export default func;
