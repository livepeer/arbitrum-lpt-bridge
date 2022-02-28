import {ethers} from 'hardhat';
import hre from 'hardhat';
import {L1Migrator__factory, L2Migrator} from '../typechain';

const address = '0xf76134B912d1556b5986a5a7ECb232d17Db9c655';
const proof = [
  '0x4d9b3186ed41ed5e7c4bcb0fb03480ca53dd9c78213cad28acb4431200e67204',
  '0xc5299c2932fdd66a43b82b3c8028c7e86090206a66406705efd3d2c8e866e82f',
  '0x72b5e0942249f5f545f67d0e60315901c2bd061331ca6b2f64950ec2306ec8df',
  '0xdfcd1889cdbdae7f429936cd72cade0f37093648489b0cf04adffa5525f10d99',
  '0xbad927c302a7f5ec820c3bf742d4d9207b7a29a1db1b8ce1cbb948275549104b',
  '0x0e1aa90bc8322d9e18b339fa240fbe8c436f388390e2edd728649c6fe12e0902',
  '0x4a8540901dfd3aa1f3a3087b4df994876728c934834668b077c7c833448db9f6',
  '0x51edabb9815a1fa51a5c032ca56a967c2b6a80917159541c1f41d3c2b71cbda2',
  '0xef743694e24994070ae9a81ec371873a00b67092bfb050bb1dd5c45df602ea0b',
  '0xab319c0ee794704207b982e5f8ee4c4f26a656118951d77c0f2618fdd3270bb5',
  '0x98abc55dadfb86568478025a059e5c0ad3a445c35e46d496a174eb0d63558ae0',
  '0x913ec5225f977def7e4d9ad488ab062f9c30394b3cbd49e1e2d98a8eb9599eee',
  '0x0ec6d52561cf7676a419ca8c9f9b35f13dcc27619e65705246560d5bbc2085bd',
];

const l1MigratorAddr = '0x21146B872D3A95d2cF9afeD03eE5a783DaE9A89A';
const l2MigratorAddr = '0x148D5b6B4df9530c7C76A810bd1Cdf69EC4c2085';

async function main(): Promise<void> {
  const l1Provider = new ethers.providers.JsonRpcProvider(
      process.env.MAINNET_URL,
  );
  const l1Migrator = new ethers.Contract(
      l1MigratorAddr,
      L1Migrator__factory.createInterface(),
      l1Provider,
  );

  const l2Migrator: L2Migrator = await ethers.getContractAt(
      'L2Migrator',
      l2MigratorAddr,
  );

  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [address],
  });

  const signer = await ethers.getSigner(address);

  const migrationData = await l1Migrator.getMigrateDelegatorParams(
      signer.address,
      signer.address,
  );

  await l2Migrator
      .connect(signer)
      .claimStake(
          migrationData.params.delegate,
          migrationData.params.stake,
          migrationData.params.fees,
          proof,
          ethers.constants.AddressZero,
      );
}

main()
    .then(() => process.exit(0))
    .catch((error: Error) => {
      console.error(error);
      process.exit(1);
    });
