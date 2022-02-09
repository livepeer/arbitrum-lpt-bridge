import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';
import {ethers} from 'hardhat';
import {getAddress, getArbitrumContracts} from '../helpers';
import {EthersProviderWrapper} from '../ethers-provider-wrapper';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, getNamedAccounts} = hre;
  const {deploy, execute} = deployments;

  const {deployer} = await getNamedAccounts();

  const arbitrumContracts = getArbitrumContracts(hre.network.name);

  const l2Provider = new EthersProviderWrapper(
      hre.companionNetworks['l2'].provider,
  );
  const l1LPT = await getAddress(ethers.provider, 'LivepeerToken', 'L1');
  const l2LPT = await getAddress(l2Provider, 'LivepeerToken', 'L2');
  const escrow = await deployments.get('L1Escrow');

  const l1Gateway = await deploy('L1LPTGateway', {
    from: deployer,
    args: [
      arbitrumContracts.l1GatewayRouter,
      escrow.address,
      l1LPT,
      l2LPT,
      arbitrumContracts.inbox,
    ],
    log: true,
  });

  await execute(
      'L1Escrow',
      {from: deployer, log: true},
      'approve',
      l1LPT,
      l1Gateway.address,
      ethers.constants.MaxUint256,
  );
};

func.tags = ['L1_GATEWAY'];
export default func;
