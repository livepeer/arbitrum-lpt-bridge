import {task} from 'hardhat/config';
import {
  getGasPriceBid,
  getMaxGas,
  getMaxSubmissionPrice,
  waitForTx,
  waitToRelayTxsToL2,
} from '../utils/arbitrum';
import {getArbitrumContracts} from '../deploy/helpers';
import {EthersProviderWrapper} from '../deploy/ethers-provider-wrapper';

task('migrate-delegator', 'Migrate delegator to L2')
    .addParam('l1addr', 'L1 address')
    .addParam('l2addr', 'L2 address')
    .addParam('sig', 'Signature authorizing migration for L1 address', '0x')
    .addOptionalParam('estimatel2', 'Set to true to only estimate L2 gas params')
    .setAction(async (taskArgs, hre) => {
      const {getNamedAccounts, deployments, ethers} = hre;

      const {deployer} = await getNamedAccounts();

      let refundAddr;
      if (deployer) {
        refundAddr = deployer;
      } else {
        refundAddr = taskArgs.l1addr;
      }

      const l2Provider = new EthersProviderWrapper(
          hre.companionNetworks['l2'].provider,
      );

      const isL1Contract =
      (await ethers.provider.getCode(taskArgs.l1addr)) !== '0x';
      if (isL1Contract && taskArgs.l1addr === taskArgs.l2addr) {
        throw new Error(
            `The l1addr ${taskArgs.l1addr} is a L1 contract and you must specify a different l2addr`,
        );
      }

      console.log(
          `WARNING: You MUST ensure that you have access to ${taskArgs.l2addr} on L2 or else you may lose access to migrated funds`,
      );

      const l1MigratorDeployment = await deployments.get('L1Migrator');
      const l2MigratorDeployment = await hre.companionNetworks[
          'l2'
      ].deployments.get('L2MigratorProxy');

      const migrator = await ethers.getContractAt(
          'L1Migrator',
          l1MigratorDeployment.address,
      );

      const l2Calldata = (
        await migrator.getMigrateDelegatorParams(taskArgs.l1addr, taskArgs.l2addr)
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
          refundAddr,
          maxSubmissionCost,
          gasPriceBid,
          l2Calldata,
      );
      const ethValue = maxSubmissionCost.add(gasPriceBid.mul(maxGas));

      if (taskArgs.estimatel2) {
        console.log(`maxGas: ${maxGas.toString()}`);
        console.log(`gasPriceBid: ${gasPriceBid.toString()}`);
        console.log(`maxSubmissionCost: ${maxSubmissionCost.toString()}`);
        console.log(`value: ${ethValue.toString()}`);
        return;
      }

      await waitToRelayTxsToL2(
          waitForTx(
              migrator.migrateDelegator(
                  taskArgs.l1addr,
                  taskArgs.l2addr,
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
