import {ethers} from 'ethers';
import util from 'util';
import childProcess from 'child_process';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import fs from 'fs';
import {ARBITRUM_NETWORK} from './constants';
const exec = util.promisify(childProcess.exec);

export const getArbitrumContracts = (network: string) => {
  if (['rinkeby', 'rinkebyDevnet', 'arbitrumRinkeby', 'arbitrumRinkebyDevnet'].indexOf(network) > -1) {
    return ARBITRUM_NETWORK.rinkeby;
  } else if (['mainnet', 'arbitrumMainnet'].indexOf(network) > -1) {
    return ARBITRUM_NETWORK.mainnet;
  } else {
    throw new Error('unknown network');
  }
};

export const getController = async (
    provider: ethers.providers.Provider | SignerWithAddress,
    network: 'L1' | 'L2',
) => {
  const controllerInterface = [
    'function setContractInfo(bytes32 _id, address _contractAddress, bytes20 _gitCommitHash) external',
    'function getContract(bytes32 _id) public view returns (address)',
  ];

  return new ethers.Contract(
      getControllerAddress(network),
      controllerInterface,
      provider,
  );
};

const getControllerAddress = (network: 'L1' | 'L2') => {
  if (!process.env.L1_PROTOCOL_DEPLOYMENT_EXPORT_PATH) {
    throw new Error('L1_PROTOCOL_DEPLOYMENT_EXPORT_PATH is not set');
  }
  if (!process.env.L2_PROTOCOL_DEPLOYMENT_EXPORT_PATH) {
    throw new Error('L2_PROTOCOL_DEPLOYMENT_EXPORT_PATH is not set');
  }

  const filename: string = network === 'L2' ? process.env.L2_PROTOCOL_DEPLOYMENT_EXPORT_PATH : process.env.L1_PROTOCOL_DEPLOYMENT_EXPORT_PATH;

  const deploymentExport = JSON.parse(fs.readFileSync(filename).toString());
  return deploymentExport.contracts.Controller.address;
};

export const getAddress = async (
    provider: ethers.providers.Provider,
    name: string,
    network: 'L1' | 'L2',
): Promise<string> => {
  const controller = await getController(provider, network);
  return controller.getContract(
      ethers.utils.solidityKeccak256(['string'], [name]),
  );
};

export const getGitHeadCommitHash = async (): Promise<string> => {
  const {stdout, stderr} = await exec('git rev-parse HEAD');
  if (stderr) {
    throw new Error(stderr);
  }
  return `0x${stdout?.trim()}`;
};
