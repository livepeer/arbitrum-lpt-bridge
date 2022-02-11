import {task} from 'hardhat/config';
import {
  getGasPriceBid,
  getMaxGas,
  getMaxSubmissionPrice,
  waitForTx,
  waitToRelayTxsToL2,
} from '../utils/arbitrum';
import {getArbitrumContracts} from '../deploy/helpers';
import {EthersProviderWrapper} from '../deploy/ethers-provider-wrapper';

task('migrate-lpt', 'Migrate LPT to L2').setAction(async (taskArgs, hre) => {
  const {deployments, ethers} = hre;

  const l2Provider = new EthersProviderWrapper(
      hre.companionNetworks['l2'].provider,
  );

  const l1MigratorDeployment = await deployments.get('L1Migrator');
  const l2MigratorDeployment = await hre.companionNetworks[
      'l2'
  ].deployments.get('L2MigratorProxy');

  const l1GatewayDeployment = await deployments.get('L1LPTGateway');
  const l2GatewayDeployment = await hre.companionNetworks['l2'].deployments.get(
      'L2LPTGateway',
  );

  const migrator = await ethers.getContractAt(
      'L1Migrator',
      l1MigratorDeployment.address,
  );

  const gateway = await ethers.getContractAt(
      'L1LPTGateway',
      l1GatewayDeployment.address,
  );

  const minterAddr = await migrator.bridgeMinterAddr();
  const tokenAddr = await migrator.tokenAddr();

  const tokenABI = [
    'function balanceOf(address) public view returns (uint256)',
  ];
  const token = await ethers.getContractAt(tokenABI, tokenAddr);

  const amount = await token.balanceOf(minterAddr);

  const l2Calldata = await gateway.getOutboundCalldata(
      token.address,
      migrator.address,
      l2MigratorDeployment.address,
      amount,
      '0x',
  );
  const gasPriceBid = await getGasPriceBid(l2Provider);
  const maxSubmissionCost = await getMaxSubmissionPrice(l2Provider, l2Calldata);
  const maxGas = await getMaxGas(
      l2Provider,
      gateway.address,
      l2GatewayDeployment.address,
      migrator.address,
      maxSubmissionCost,
      gasPriceBid,
      l2Calldata,
  );
  const ethValue = maxSubmissionCost.add(gasPriceBid.mul(maxGas));

  await waitToRelayTxsToL2(
      waitForTx(
          migrator.migrateLPT(maxGas, gasPriceBid, maxSubmissionCost, {
            value: ethValue,
          }),
      ),
      getArbitrumContracts(hre.network.name).inbox,
      ethers.provider,
      l2Provider,
  );
});
