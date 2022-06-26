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

task('migrate-eth', 'Migrate ETH to L2')
    .addOptionalParam('estimatel2', 'Set to true to only estimate L2 gas params')
    .setAction(async (taskArgs, hre) => {
      const {deployments, ethers} = hre;

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

      const l2Calldata = '0x';
      const gasPriceBid = await getGasPriceBid(l2Provider);
      const maxSubmissionCost = await getMaxSubmissionPrice(hre, l2Calldata);
      const maxGas = await getMaxGas(
          l2Provider,
          migrator.address,
          l2MigratorDeployment.address,
          migrator.address,
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
              migrator.migrateETH(maxGas, gasPriceBid, maxSubmissionCost, {
                value: ethValue,
              }),
          ),
          getArbitrumContracts(hre.network.name).inbox,
          ethers.provider,
          l2Provider,
      );
    });
