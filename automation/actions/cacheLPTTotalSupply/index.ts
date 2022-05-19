import {ActionFn, Context, Event} from '@tenderly/actions';
import {ethers} from 'ethers';
import {waitForTx, waitToRelayTxsToL2} from '../../../utils/arbitrum';
import {getArbParams, getCache} from './helpers';
import {ARBITRUM_NETWORK} from '../../../deploy/constants';

export const triggerCache: ActionFn = async (
    context: Context,
    _event: Event,
) => {
  const infuraKeyL1 = await context.secrets.get('INFURA_KEY_ETH');
  const infuraKeyL2 = await context.secrets.get('INFURA_KEY_ARB');

  const ethProvider = new ethers.providers.InfuraProvider(infuraKeyL1);
  const arbProvider = new ethers.providers.InfuraProvider(infuraKeyL2);

  const pvtKey = await context.secrets.get('PVT_KEY_SIGNER');
  const signer = new ethers.Wallet(pvtKey);

  const cache = getCache(ethProvider);

  const {maxGas, gasPriceBid, maxSubmissionCost, ethValue} =
    await getArbParams(cache, arbProvider, signer.address);

  const tx = cache
      .connect(signer)
      .cacheTotalSupply(maxGas, gasPriceBid, maxSubmissionCost, {
        value: ethValue,
      });

  const {l1TxHash, l2TxHash} = await waitToRelayTxsToL2(
      waitForTx(tx),
      ARBITRUM_NETWORK.rinkeby.inbox,
      ethProvider,
      arbProvider,
  );

  await context.storage.putStr('CACHE_LPT_SUPPLY/L1_HASH', l1TxHash);
  await context.storage.putStr('CACHE_LPT_SUPPLY/L2_HASH', l2TxHash);
};
