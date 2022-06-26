import {BigNumber, ethers} from 'ethers';
import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {ARBITRUM_NETWORK} from '../../deploy/constants';
import {getArbitrumCoreContracts} from './contracts';

export async function getGasPriceBid(
    l2: ethers.providers.BaseProvider,
): Promise<BigNumber> {
  return await l2.getGasPrice();
}

export async function getMaxSubmissionPrice(
    hre: HardhatRuntimeEnvironment,
    calldataOrCalldataLength: string | number,
) {
  const calldataLength =
    typeof calldataOrCalldataLength === 'string' ?
      calldataOrCalldataLength.length :
      calldataOrCalldataLength;

  const provider = hre.ethers.provider;

  const abi = [
    'function calculateRetryableSubmissionFee(uint256 dataLength,uint256 baseFee) external view returns (uint256)',
  ];
  const inbox = new ethers.Contract(
      ARBITRUM_NETWORK[hre.network.name].inbox,
      abi,
      provider,
  );
  const maxSubmissionPrice = await inbox.calculateRetryableSubmissionFee(
      calldataLength,
      await provider.getGasPrice(),
  );

  return maxSubmissionPrice;
}

export async function getMaxGas(
    l2: ethers.providers.BaseProvider,
    sender: string,
    destination: string,
    refundDestination: string,
    calldata: string,
): Promise<BigNumber> {
  const estimatedGas = await getArbitrumCoreContracts(
      l2,
  ).nodeInterface.estimateGas.estimateRetryableTicket(
      sender,
      ethers.utils.parseEther('0.05'),
      destination,
      0,
      refundDestination,
      refundDestination,
      calldata,
  );
  const maxGas = estimatedGas.mul(4);

  return maxGas;
}
