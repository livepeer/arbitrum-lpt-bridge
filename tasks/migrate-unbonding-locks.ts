import {task} from 'hardhat/config';
import {
  getGasPriceBid,
  getMaxGas,
  getMaxSubmissionPrice,
  waitForTx,
  waitToRelayTxsToL2,
} from '../utils/arbitrum';
import {getUnbondingLockIds} from '../utils/unbonding-lock-ids';
import {getArbitrumContracts} from '../deploy/helpers';
import {EthersProviderWrapper} from '../deploy/ethers-provider-wrapper';

task('migrate-unbonding-locks', 'Migrate unbonding locks to L2')
    .addParam('l1addr', 'L1 address')
    .addParam('l2addr', 'L2 address')
    .addParam('sig', 'Signature authorizing migration for L1 address', '0x')
    .setAction(async (taskArgs, hre) => {
      const {getNamedAccounts, deployments, ethers} = hre;
      const {deployer} = await getNamedAccounts();

      const l2Provider = new EthersProviderWrapper(
          hre.companionNetworks['l2'].provider,
      );

      const l1MigratorDeployment = await deployments.get('L1Migrator');
      const l2MigratorDeployment = await hre.companionNetworks[
          'l2'
      ].deployments.get('L2MigratorProxy');

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

      const l2Calldata = (
        await migrator.getMigrateUnbondingLocksParams(
            taskArgs.l1addr,
            taskArgs.l2addr,
            unbondingLockIds,
        )
      ).data;
      const gasPriceBid = await getGasPriceBid(l2Provider);
      const maxSubmissionCost = await getMaxSubmissionPrice(
          l2Provider,
          l2Calldata,
      );
      const maxGas = await getMaxGas(
          l2Provider,
          migrator.address,
          l2MigratorDeployment.address,
          deployer,
          maxSubmissionCost,
          gasPriceBid,
          l2Calldata,
      );
      const ethValue = maxSubmissionCost.add(gasPriceBid.mul(maxGas));

      await waitToRelayTxsToL2(
          waitForTx(
              migrator.migrateUnbondingLocks(
                  taskArgs.l1addr,
                  taskArgs.l2addr,
                  unbondingLockIds,
                  taskArgs.sig,
                  maxGas,
                  gasPriceBid,
                  maxSubmissionCost,
                  {value: ethValue},
              ),
          ),
          getArbitrumContracts(hre.network.name).inbox,
          ethers.provider,
          l2Provider,
      );
    });
