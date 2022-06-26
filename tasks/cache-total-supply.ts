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

task('cache-total-supply', 'Cache total supply on L2')
    .addOptionalParam('refund', '(Optional) Refund address on L2')
    .addOptionalParam(
        'estimatel2',
        '(Optional) Set to true to only estimate L2 gas params',
    )
    .setAction(async (taskArgs, hre) => {
      const {getNamedAccounts, deployments, ethers} = hre;
      let {deployer} = await getNamedAccounts();
      if (taskArgs.refund) {
        deployer = taskArgs.refund;
      }

      const l2Provider = new EthersProviderWrapper(
          hre.companionNetworks['l2'].provider,
      );

      const l1DataCacheDeployment = await deployments.get('L1LPTDataCache');
      const l2DataCacheDeployment = await hre.companionNetworks[
          'l2'
      ].deployments.get('L2LPTDataCache');

      const cache = await ethers.getContractAt(
          'L1LPTDataCache',
          l1DataCacheDeployment.address,
      );

      const l2Calldata = (await cache.getCacheTotalSupplyData()).data;
      const gasPriceBid = await getGasPriceBid(l2Provider);
      const maxSubmissionCost = await getMaxSubmissionPrice(hre, l2Calldata);
      const maxGas = await getMaxGas(
          l2Provider,
          cache.address,
          l2DataCacheDeployment.address,
          deployer,
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
              cache.cacheTotalSupply(maxGas, gasPriceBid, maxSubmissionCost, {
                value: ethValue,
              }),
          ),
          getArbitrumContracts(hre.network.name).inbox,
          ethers.provider,
          l2Provider,
      );
    });
