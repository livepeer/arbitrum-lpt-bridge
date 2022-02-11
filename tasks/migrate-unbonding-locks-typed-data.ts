import {task} from 'hardhat/config';
import {L1MigratorAuth} from '../utils/migration-auth';
import {getUnbondingLockIds} from '../utils/unbonding-lock-ids';

task(
    'migrate-unbonding-locks-typed-data',
    'Return typed data for migrateUnbondingLocks auth',
)
    .addParam('l1addr', 'L1 address')
    .addParam('l2addr', 'L2 address')
    .setAction(async (taskArgs, hre) => {
      const {getChainId, ethers, deployments} = hre;

      const l1MigratorDeployment = await deployments.get('L1Migrator');

      const migrator = await ethers.getContractAt(
          'L1Migrator',
          l1MigratorDeployment.address,
      );

      const bondingManagerAddr = await migrator.bondingManagerAddr();
      const bondingManagerABI = [
        'function getDelegator(address) public view returns (uint256 bondedAmount,uint256 fees,address delegateAddress,uint256 delegatedAmount,uint256 startRound,uint256 lastClaimRound,uint256 nextUnbondingLockId)',
        'function getDelegatorUnbondingLock(address,uint256) public view returns (uint256 amount,uint256 withdrawRound)',
      ];
      const bondingManager = await ethers.getContractAt(
          bondingManagerABI,
          bondingManagerAddr,
      );

      const unbondingLockIds = await getUnbondingLockIds(
          bondingManager,
          taskArgs.l1addr,
      );

      const auth = new L1MigratorAuth(
          l1MigratorDeployment.address,
          parseInt(await getChainId()),
      );

      console.log(
          JSON.stringify(
              auth.migrateUnbondingLocksTypedData(
                  taskArgs.l1addr,
                  taskArgs.l2addr,
                  unbondingLockIds,
              ),
              null,
              2,
          ),
      );
    });
