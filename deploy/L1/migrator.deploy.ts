import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';
import {ethers} from 'hardhat';
import {getAddress, getArbitrumContracts} from '../helpers';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, getNamedAccounts} = hre;
  const {deploy} = deployments;

  const {deployer} = await getNamedAccounts();

  const arbitrumContracts = getArbitrumContracts(hre.network.name);

  const bondingManager = await getAddress(
      ethers.provider,
      'BondingManager',
      'L1',
  );
  const ticketBroker = await getAddress(ethers.provider, 'TicketBroker', 'L1');
  const token = await getAddress(ethers.provider, 'LivepeerToken', 'L1');

  const l2Migrator = await hre.companionNetworks['l2'].deployments.get(
      'L2MigratorProxy',
  );
  const l1LPTgateway = await deployments.get('L1LPTGateway');

  await deploy('L1Migrator', {
    from: deployer,
    args: [
      arbitrumContracts.inbox,
      bondingManager,
      ticketBroker,
      token,
      l1LPTgateway.address,
      l2Migrator.address,
    ],
    log: true,
  });
};

func.tags = ['L1_MIGRATOR'];
export default func;
