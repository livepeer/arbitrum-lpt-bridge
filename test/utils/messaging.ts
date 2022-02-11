import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {ethers} from 'ethers';
import hre from 'hardhat';

export function applyL1ToL2Alias(l1Address: string): string {
  const offset = ethers.BigNumber.from(
      '0x1111000000000000000000000000000000001111',
  );
  const l1AddressAsNumber = ethers.BigNumber.from(l1Address);

  const l2AddressAsNumber = l1AddressAsNumber.add(offset);

  const mask = ethers.BigNumber.from(2).pow(160);
  return l2AddressAsNumber.mod(mask).toHexString();
}

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
