import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import hre from 'hardhat';
import {applyL1ToL2Alias} from '../../utils/arbitrum';

export async function getL2SignerFromL1(
    l1Signer: SignerWithAddress,
): Promise<SignerWithAddress> {
  const l2Address = applyL1ToL2Alias(await l1Signer.getAddress());

  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [l2Address],
  });

  const l2Signer = await hre.ethers.getSigner(l2Address);

  return l2Signer;
}
