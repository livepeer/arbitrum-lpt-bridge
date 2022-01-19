import {ethers} from 'ethers';
import util from 'util';
import childProcess from 'child_process';
import {L2_Controller, L1_Controller} from './constants';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
const exec = util.promisify(childProcess.exec);

export const getController = async (
    provider: ethers.providers.Provider | SignerWithAddress,
    network: 'L1' | 'L2',
) => {
  const controllerInterface = [
    'function setContractInfo(bytes32 _id, address _contractAddress, bytes20 _gitCommitHash) external',
    'function getContract(bytes32 _id) public view returns (address)',
  ];

  return new ethers.Contract(
    network === 'L2' ? L2_Controller : L1_Controller,
    controllerInterface,
    provider,
  );
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
