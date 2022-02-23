import {ethers} from 'hardhat';
import hre from 'hardhat';
import {EthersProviderWrapper} from '../deploy/ethers-provider-wrapper';
import {L2Migrator} from '../typechain';

const getL1PendingStake = async (orchAddr: string) => {
  const bondingManagerAddr = '0x511bc4556d823ae99630ae8de28b9b80df90ea2e';
  const bondingManagerABI = [
    'function pendingStake(address _delegator, uint256 _endRound) public view returns (uint256)',
    'function pendingFees(address _delegator, uint256 _endRound) public view returns (uint256)',
  ];
  const roundNum = 2466;

  const bondingManager = new ethers.Contract(
      bondingManagerAddr,
      bondingManagerABI,
      new EthersProviderWrapper(hre.companionNetworks['l1'].provider),
  );

  const pendingStake = await bondingManager.pendingStake(orchAddr, roundNum);
  const pendingFees = await bondingManager.pendingFees(orchAddr, roundNum);

  return {
    address: orchAddr,
    stake: pendingStake,
    fees: pendingFees,
  };
};

const getClaimers = async () => {
  const l2MigratorAddr = (await hre.deployments.get('L2Migrator')).address;
  const claimStakeEnableBlock = 14263154;

  const l2Migrator: L2Migrator = await ethers.getContractAt(
      'L2Migrator',
      l2MigratorAddr,
  );

  const events = await l2Migrator.queryFilter(
      l2Migrator.filters.StakeClaimed(),
      claimStakeEnableBlock,
      'latest',
  );

  return events.map((event) => {
    return {
      address: event.args.delegator,
      stake: event.args.stake,
      fees: event.args.fees,
    };
  });
};

async function main(): Promise<void> {
  const stakeClaimers = await getClaimers();

  const pendingStake = await Promise.all(
      stakeClaimers.map((delegator) => getL1PendingStake(delegator.address)),
  );

  console.log(
      `address \t L2 stake claimed \2 L1 pending stake \t L2 fees claimed \t L1 pending fees`,
  );

  stakeClaimers.forEach((claimer) => {
    const l1Stake = pendingStake.filter(
        (delegator) => delegator.address === claimer.address,
    );
    console.log(`
        ${claimer.address} \t
        ${ethers.utils.formatEther(claimer.stake)} \t
        ${ethers.utils.formatEther(l1Stake[0].stake)} \t
        ${ethers.utils.formatEther(claimer.fees)} \t
        ${ethers.utils.formatEther(l1Stake[0].fees)}`);
  });
}

main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
      console.error(error);
      process.exit(1);
    });
