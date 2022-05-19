import {ActionFn, Context, Event} from '@tenderly/actions';
import {ethers} from 'ethers';
import {getArbParams, getCache} from './helpers';

export const triggerCache: ActionFn = async (
    context: Context,
    _event: Event,
) => {
  const infuraKeyL1 = await context.secrets.get('INFURA_KEY_L1');
  const infuraKeyL2 = await context.secrets.get('INFURA_KEY_L2');

  const l1Provider = new ethers.providers.InfuraProvider(infuraKeyL1);
  const l2Provider = new ethers.providers.InfuraProvider(infuraKeyL2);

  const pvtKey = await context.secrets.get('PVT_KEY');
  const signer = new ethers.Wallet(pvtKey);

  const cache = getCache(l1Provider);

  const {maxGas, gasPriceBid, maxSubmissionCost, ethValue} =
    await getArbParams(cache, l2Provider, signer.address);

  await cache
      .connect(signer)
      .cacheTotalSupply(maxGas, gasPriceBid, maxSubmissionCost, {
        value: ethValue,
      });
};
