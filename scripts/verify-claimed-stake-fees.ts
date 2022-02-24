import {ethers} from 'hardhat';
import hre from 'hardhat';
import {EthersProviderWrapper} from '../deploy/ethers-provider-wrapper';
import {DelegatorPool, L2Migrator} from '../typechain';
import {BigNumber} from 'ethers';

const bondingManagerABI = [
  'function pendingStake(address _delegator, uint256 _endRound) public view returns (uint256)',
  'function pendingFees(address _delegator, uint256 _endRound) public view returns (uint256)',
];

const getL1Pending = async (orchAddr: string) => {
  const bondingManagerAddr = '0x511bc4556d823ae99630ae8de28b9b80df90ea2e';
  const roundNum = 2466;

  const bondingManager = new ethers.Contract(
      bondingManagerAddr,
      bondingManagerABI,
      new EthersProviderWrapper(hre.companionNetworks['l1'].provider),
  );

  const [pendingStake, pendingFees] = await Promise.all([
    await bondingManager.pendingStake(orchAddr, roundNum),
    await bondingManager.pendingFees(orchAddr, roundNum),
  ]);

  return {
    address: orchAddr,
    stake: pendingStake,
    fees: pendingFees,
  };
};

const getL2Pending = async (orchAddr: string) => {
  const bondingManagerAddr = '0x35Bcf3c30594191d53231E4FF333E8A770453e40';
  const roundNum = 2466; // does not matter on L2, only current round is used

  const bondingManager = new ethers.Contract(
      bondingManagerAddr,
      bondingManagerABI,
      new EthersProviderWrapper(hre.network.provider),
  );

  const [pendingStake, pendingFees] = await Promise.all([
    await bondingManager.pendingStake(orchAddr, roundNum),
    await bondingManager.pendingFees(orchAddr, roundNum),
  ]);

  return {
    address: orchAddr,
    stake: pendingStake,
    fees: pendingFees,
  };
};

const getClaimers = async () => {
  const l2MigratorAddr = (await hre.deployments.get('L2MigratorProxy')).address;
  const claimStakeEnableBlock = 6737210;

  const l2Migrator: L2Migrator = await ethers.getContractAt(
      'L2Migrator',
      l2MigratorAddr,
  );

  const events = await l2Migrator.queryFilter(
      l2Migrator.filters.StakeClaimed(),
      claimStakeEnableBlock,
      'latest',
  );

  console.log(events.length, 'delegators claimed stake and fees');

  const data: {
    address: string;
    requestedStake: BigNumber;
    requestedFees: BigNumber;
    owedStake: BigNumber;
    owedFees: BigNumber;
  }[] = [];

  // faster - run if order of addresses not important
  await Promise.all(
      events.map(async (event) => {
        const poolAddr = await l2Migrator.delegatorPools(event.args.delegate);

        // if delegator pool does not exist
        // i.e orchestrator did not migrate
        if (poolAddr !== ethers.constants.AddressZero) {
          const delegatorPool: DelegatorPool = await ethers.getContractAt(
              'DelegatorPool',
              poolAddr,
          );

          const claimEvent = await delegatorPool.queryFilter(
              delegatorPool.filters.Claimed(),
              event.blockHash,
          );

          data.push({
            address: event.args.delegator,
            requestedStake: event.args.stake,
            requestedFees: event.args.fees,
            owedStake: claimEvent[0].args._stake,
            owedFees: claimEvent[0].args._fees,
          });
        }
      }),
  );

  // slower - run if order of addresses is important/only care about new addresses

  // for (let index = 0; index < events.length; index++) {
  //   const event = events[index];

  //   const poolAddr = await l2Migrator.delegatorPools(event.args.delegate);
  //   const delegatorPool: DelegatorPool = await ethers.getContractAt(
  //       'DelegatorPool',
  //       poolAddr,
  //   );

  //   const claimEvent = await delegatorPool.queryFilter(
  //       delegatorPool.filters.Claimed(),
  //       event.blockHash,
  //   );

  //   data.push({
  //     address: event.args.delegator,
  //     requestedStake: event.args.stake,
  //     requestedFees: event.args.fees,
  //     owedStake: claimEvent[0].args._stake,
  //     owedFees: claimEvent[0].args._fees,
  //   });
  // }

  return data;
};

async function main(): Promise<void> {
  console.log('fetching Delegators who called claimStake');
  const stakeClaimers = await getClaimers();

  console.log('fetching L1 pending stake and fees');
  const pendingL1 = await Promise.all(
      stakeClaimers.map((delegator) => getL1Pending(delegator.address)),
  );

  console.log('fetching L2 pending stake and fees');
  const pendingL2 = await Promise.all(
      stakeClaimers.map((delegator) => getL2Pending(delegator.address)),
  );

  const table: any = [];

  stakeClaimers.forEach((claimer) => {
    const l1Pending = pendingL1.filter(
        (delegator) => delegator.address === claimer.address,
    )[0];

    const l2Pending = pendingL2.filter(
        (delegator) => delegator.address === claimer.address,
    )[0];

    table.push({
      address: claimer.address,
      l2pendingStake: ethers.utils.formatEther(l2Pending.stake),
      l1pendingStake: ethers.utils.formatEther(l1Pending.stake),
      owedStake: ethers.utils.formatEther(claimer.owedStake),
      l2pendingFees: ethers.utils.formatEther(l2Pending.fees),
      l1pendingFees: ethers.utils.formatEther(l1Pending.fees),
      owedFees: ethers.utils.formatEther(claimer.owedFees),
    });
  });

  console.table(table);
}

main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
      console.error(error);
      process.exit(1);
    });
