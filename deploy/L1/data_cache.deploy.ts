import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';
import {ethers} from 'hardhat';
import {getAddress, getArbitrumContracts} from '../helpers';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;
  const {deployer} = await getNamedAccounts();

  const arbitrumContracts = getArbitrumContracts(hre.network.name);

  const token = await getAddress(ethers.provider, 'LivepeerToken', 'L1');

  const L2LPTDataCache = await hre.companionNetworks['l2'].deployments.get(
      'L2LPTDataCache',
  );

  await deploy('L1LPTDataCache', {
    from: deployer,
    args: [arbitrumContracts.inbox, token, L2LPTDataCache.address],
    log: true,
  });
};

func.tags = ['L1_DATA_CACHE'];
export default func;
