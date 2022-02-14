import {task} from 'hardhat/config';
import {waitToRelayTxsToL2} from '../utils/arbitrum';
import {getArbitrumContracts} from '../deploy/helpers';
import {EthersProviderWrapper} from '../deploy/ethers-provider-wrapper';

task('wait-to-relay-tx-to-l2', 'Wait for a tx to be relayed to L2')
    .addParam('tx', 'L1 tx hash')
    .setAction(async (taskArgs, hre) => {
      const {ethers} = hre;

      const l2Provider = new EthersProviderWrapper(
          hre.companionNetworks['l2'].provider,
      );

      await waitToRelayTxsToL2(
          ethers.provider.getTransactionReceipt(taskArgs.tx),
          getArbitrumContracts(hre.network.name).inbox,
          ethers.provider,
          l2Provider,
      );
    });
