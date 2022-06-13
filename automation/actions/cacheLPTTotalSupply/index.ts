import {ActionFn, Context, Event} from '@tenderly/actions';
import {ethers} from 'ethers';
import {waitForTx, waitToRelayTxsToL2} from '../../../utils/arbitrum';
import {getArbParams, getCache} from './helpers';
import {ARBITRUM_NETWORK} from '../../../deploy/constants';

export const triggerCache: ActionFn = async (
    context: Context,
    _event: Event,
) => {
  // rpc key should include full URL eg:
  // infura key for mainnet: https://mainnet.infura.io/v3/<infura key>
  // or alchemy https://arb-rinkeby.g.alchemy.com/v2/<alchemy key>
  const rpcL1 = await context.secrets.get('RPC_KEY_ETH');
  const rpcL2 = await context.secrets.get('RPC_KEY_ARB');

  const ethProvider = new ethers.providers.JsonRpcProvider(rpcL1);
  const arbProvider = new ethers.providers.JsonRpcProvider(rpcL2);

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
      ARBITRUM_NETWORK.mainnet.inbox,
      ethProvider,
      arbProvider,
  );

  await context.storage.putStr('CACHE_LPT_SUPPLY/L1_HASH', l1TxHash);
  await context.storage.putStr('CACHE_LPT_SUPPLY/L2_HASH', l2TxHash);
};
