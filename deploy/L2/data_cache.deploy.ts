import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';
import {getController, getGitHeadCommitHash} from '../helpers';
import {ethers} from 'hardhat';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;

  const {deployer} = await getNamedAccounts();

  const dataCache = await deploy('L2LPTDataCache', {
    from: deployer,
    args: [],
    log: true,
  });

  const signer = await ethers.getSigners();

  const controller = await getController(signer[0], 'L2');
  await (
    await controller.setContractInfo(
        ethers.utils.solidityKeccak256(['string'], ['L2LPTDataCache']),
        dataCache.address,
        await getGitHeadCommitHash(),
    )
  ).wait();
};

func.tags = ['L2_DATA_CACHE'];
export default func;
