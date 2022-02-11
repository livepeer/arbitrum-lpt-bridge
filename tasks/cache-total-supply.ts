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

task('cache-total-supply', 'Cache total supply on L2').setAction(
    async (_, hre) => {
      const {getNamedAccounts, deployments, ethers} = hre;
      const {deployer} = await getNamedAccounts();

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
      const maxSubmissionCost = await getMaxSubmissionPrice(
          l2Provider,
          l2Calldata,
      );
      const maxGas = await getMaxGas(
          l2Provider,
          cache.address,
          l2DataCacheDeployment.address,
          deployer,
          maxSubmissionCost,
          gasPriceBid,
          l2Calldata,
      );
      const ethValue = maxSubmissionCost.add(gasPriceBid.mul(maxGas));

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
    },
);
