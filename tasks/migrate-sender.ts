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

task('migrate-sender', 'Migrate TicketBroker sender to L2')
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

      const l2Calldata = (
        await migrator.getMigrateSenderParams(taskArgs.l1addr, taskArgs.l2addr)
      ).data;
      const gasPriceBid = await getGasPriceBid(l2Provider);
      const maxSubmissionCost = await getMaxSubmissionPrice(hre, l2Calldata);
      const maxGas = await getMaxGas(
          l2Provider,
          migrator.address,
          l2MigratorDeployment.address,
          deployer,
          l2Calldata,
      );
      const ethValue = maxSubmissionCost.add(gasPriceBid.mul(maxGas));

      await waitToRelayTxsToL2(
          waitForTx(
              migrator.migrateSender(
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
