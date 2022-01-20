import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';
import {getAddress} from '../helpers';
import {ethers} from 'hardhat';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, getNamedAccounts} = hre;
  const {execute} = deployments;

  const {deployer} = await getNamedAccounts();

  const l2Gateway = await hre.companionNetworks['l2'].deployments.get(
      'L2LPTGateway',
  );

  const minter = await getAddress(ethers.provider, 'Minter', 'L1');

  await execute(
      'L1LPTGateway',
      {from: deployer, log: true},
      'setCounterpart',
      l2Gateway.address,
  );

  // Note This is the L1 BridgeMinter
  await execute(
      'L1LPTGateway',
      {from: deployer, log: true},
      'setMinter',
      minter,
  );
};

func.tags = ['L1_GATEWAY_INIT'];
export default func;
