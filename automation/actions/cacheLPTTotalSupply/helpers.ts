import {ethers} from 'ethers';
import {L1LPTDataCacheAddress, L2LPTDataCacheAddress} from './addresses';
import {
  getGasPriceBid,
  getMaxGas,
  getMaxSubmissionPrice,
} from '../../../utils/arbitrum';
import {L1LPTDataCache} from '../../../typechain';

export const getCache = (
    provider: ethers.providers.Provider,
): L1LPTDataCache => {
  const abi = [
    'function cacheTotalSupply(uint256 _maxGas, uint256 _gasPriceBid, uint256 _maxSubmissionCost) external payable',
  ];
  return new ethers.Contract(
      L1LPTDataCacheAddress,
      abi,
      provider,
  ) as L1LPTDataCache;
};

export const getArbParams = async (
    cache: L1LPTDataCache,
    l2Provider: ethers.providers.JsonRpcProvider,
    signerAddr: string,
) => {
  const l2Calldata = (await cache.getCacheTotalSupplyData()).data;
  const gasPriceBid = await getGasPriceBid(l2Provider);
  const maxSubmissionCost = await getMaxSubmissionPrice(l2Provider, l2Calldata);
  const maxGas = await getMaxGas(
      l2Provider,
      cache.address,
      L2LPTDataCacheAddress,
      signerAddr,
      maxSubmissionCost,
      gasPriceBid,
      l2Calldata,
  );
  const ethValue = maxSubmissionCost.add(gasPriceBid.mul(maxGas));

  return {maxGas, gasPriceBid, maxSubmissionCost, ethValue};
};
