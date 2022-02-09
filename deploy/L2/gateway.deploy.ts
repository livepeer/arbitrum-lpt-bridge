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

  const l1Provider = new EthersProviderWrapper(
      hre.companionNetworks['l1'].provider,
  );
  const l1LPT = await getAddress(l1Provider, 'LivepeerToken', 'L1');
  const l2LPT = await getAddress(ethers.provider, 'LivepeerToken', 'L2');
  const l2DataCache = await deployments.get('L2LPTDataCache');

  const l2Gateway = await deploy('L2LPTGateway', {
    from: deployer,
    args: [
      arbitrumContracts.l2GatewayRouter,
      l1LPT,
      l2LPT,
      l2DataCache.address,
    ],
    log: true,
  });

  await execute(
      'L2_LPT',
      {from: deployer, log: true},
      'grantRole',
      ethers.utils.solidityKeccak256(['string'], ['MINTER_ROLE']),
      l2Gateway.address,
  );

  await execute(
      'L2_LPT',
      {from: deployer, log: true},
      'grantRole',
      ethers.utils.solidityKeccak256(['string'], ['BURNER_ROLE']),
      l2Gateway.address,
  );
};

func.tags = ['L2_GATEWAY'];
export default func;
