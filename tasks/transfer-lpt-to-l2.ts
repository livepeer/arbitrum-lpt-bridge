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

task('transfer-lpt-to-l2', 'Transfer LPT to L2')
    .addParam('to', 'Address of receiver')
    .addParam('amount', 'Amount of LPT')
    .setAction(async (taskArgs, hre) => {
      const {deployments, getNamedAccounts, ethers} = hre;
      const {deployer} = await getNamedAccounts();

      const l2Provider = new EthersProviderWrapper(
          hre.companionNetworks['l2'].provider,
      );

      const l1GatewayDeployment = await deployments.get('L1LPTGateway');
      const l2GatewayDeployment = await hre.companionNetworks[
          'l2'
      ].deployments.get('L2LPTGateway');

      const gateway = await ethers.getContractAt(
          'L1LPTGateway',
          l1GatewayDeployment.address,
      );

      const tokenAddr = await gateway.l1Lpt();

      const tokenABI = ['function approve(address,uint256) external'];
      const token = await ethers.getContractAt(tokenABI, tokenAddr);

      const l2Calldata = await gateway.getOutboundCalldata(
          token.address,
          deployer,
          taskArgs.to,
          taskArgs.amount,
          '0x',
      );
      const gasPriceBid = await getGasPriceBid(l2Provider);
      const maxSubmissionCost = await getMaxSubmissionPrice(hre, l2Calldata);
      const maxGas = await getMaxGas(
          l2Provider,
          gateway.address,
          l2GatewayDeployment.address,
          deployer,
          l2Calldata,
      );
      const ethValue = maxSubmissionCost.add(gasPriceBid.mul(maxGas));

      const transferData = ethers.utils.defaultAbiCoder.encode(
          ['uint256', 'bytes'],
          [maxSubmissionCost, '0x'],
      );

      await waitForTx(token.approve(gateway.address, taskArgs.amount));

      await waitToRelayTxsToL2(
          waitForTx(
              gateway.outboundTransfer(
                  token.address,
                  taskArgs.to,
                  taskArgs.amount,
                  maxGas,
                  gasPriceBid,
                  transferData,
                  {value: ethValue},
              ),
          ),
          getArbitrumContracts(hre.network.name).inbox,
          ethers.provider,
          l2Provider,
      );
    });
