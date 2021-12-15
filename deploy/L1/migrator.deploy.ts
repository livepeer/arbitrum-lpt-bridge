import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';
import {ARBITRUM_NETWORK} from '../constants';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;

  const {deployer} = await getNamedAccounts();

  const bondingManager = '0x595ab11a0bffbca8134d2105bcf985e85732af5c';
  const ticketBroker = '0xbc10683cf0d6c1152f80e9954701bec1e7dd1648';
  const l2Migrator = await hre.companionNetworks['l2'].deployments.get(
      'L2Migrator',
  );

  await deploy('L1Migrator', {
    from: deployer,
    args: [
      ARBITRUM_NETWORK.rinkeby.inbox,
      bondingManager,
      ticketBroker,
      l2Migrator.address,
    ],
    log: true,
  });
};

func.tags = ['L1_MIGRATOR'];
export default func;
