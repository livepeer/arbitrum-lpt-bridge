import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/dist/types';
import {ethers} from 'hardhat';
import {getAddress} from '../helpers';

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const {deployments, getNamedAccounts} = hre;
  const {deploy, execute} = deployments;

  const {deployer} = await getNamedAccounts();

  const delegatorPool = await deployments.get('DelegatorPool');
  const bondingManager = await getAddress(
      ethers.provider,
      'BondingManager',
      'L2',
  );
  const ticketBroker = await getAddress(ethers.provider, 'TicketBroker', 'L2');
  const merkleSnapshot = await getAddress(
      ethers.provider,
      'MerkleSnapshot',
      'L2',
  );

  await deploy('L2Migrator', {
    from: deployer,
    args: [
      ethers.constants.AddressZero,
      delegatorPool.address,
      bondingManager,
      ticketBroker,
      merkleSnapshot,
    ],
    log: true,
  });

  await execute(
      'L2Migrator',
      {from: deployer, log: true},
      'grantRole',
      ethers.utils.solidityKeccak256(['string'], ['GOVERNOR_ROLE']),
      deployer,
  );
};

func.tags = ['L2_MIGRATOR'];
export default func;
