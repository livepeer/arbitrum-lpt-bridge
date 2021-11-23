import {ethers as ethers2, Wallet} from 'ethers';
import {ethers} from 'hardhat';
import {ARBITRUM_NETWORK} from '../deploy/constants';
import {L1LPTGateway__factory} from '../typechain';

export function getArbitrumCoreContracts(l2: ethers2.providers.BaseProvider) {
  return {
    arbRetryableTx: new ethers.Contract(
        ARBITRUM_NETWORK.rinkeby.arbRetryableTx,
        require('../test/utils/abis/ArbRetryableTx.json').abi,
        l2,
    ),
    nodeInterface: new ethers.Contract(
        ARBITRUM_NETWORK.rinkeby.nodeInterface,
        require('../test/utils/abis/NodeInterface.json').abi,
        l2,
    ),
  };
}

async function main(): Promise<void> {
  const l1GatewayAddress = '0x335Ea1163A86D0F5536cC34D8D91d71342821160';
  const l1LPTAddress = '0x3d0dB674f6912c369995E82328187A9221b3efa5';

  const amount = ethers.utils.parseEther('100');

  const ethProvider = new ethers.providers.JsonRpcProvider(
      process.env.RINKEBY_URL,
  );

  const arbProvider = new ethers.providers.JsonRpcProvider(
      process.env.ARB_RINKEBY_URL,
  );

  const PK = process.env.PRIVATE_KEY || '';

  const l1TestWallet = new Wallet(PK, ethProvider);
  const l2TestWallet = new Wallet(PK, arbProvider);

  const l1Gateway = new L1LPTGateway__factory(l1TestWallet).attach(
      l1GatewayAddress,
  );

  const gasPriceBid = await arbProvider.getGasPrice();

  const calldata = await l1Gateway.getOutboundCalldata(
      l1LPTAddress,
      l1TestWallet.address,
      l2TestWallet.address,
      amount,
      '0x',
  );
  const [submissionPrice] = await getArbitrumCoreContracts(
      arbProvider,
  ).arbRetryableTx.getSubmissionPrice(calldata.length);
  const maxSubmissionPrice = submissionPrice.mul(4);

  const [estimatedGas] = await getArbitrumCoreContracts(
      arbProvider,
  ).nodeInterface.estimateRetryableTicket(
      l1TestWallet.address,
      ethers.utils.parseEther('0.05'),
      l2TestWallet.address,
      0,
      maxSubmissionPrice,
      l2TestWallet.address,
      l2TestWallet.address,
      0,
      gasPriceBid,
      calldata,
  );
  const maxGas = estimatedGas.mul(4);

  const defaultData = ethers.utils.defaultAbiCoder.encode(
      ['uint256', 'bytes'],
      [maxSubmissionPrice, '0x'],
  );
  const ethValue = await maxSubmissionPrice.add(gasPriceBid.mul(maxGas));

  const tx = await l1Gateway.outboundTransfer(
      l1LPTAddress,
      l1TestWallet.address,
      amount,
      maxGas,
      gasPriceBid,
      defaultData,
      {
        value: ethValue,
      },
  );

  console.log(tx.hash);
}

main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
      console.error(error);
      process.exit(1);
    });
