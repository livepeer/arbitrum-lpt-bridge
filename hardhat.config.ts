import * as dotenv from 'dotenv';

import {HardhatUserConfig} from 'hardhat/config';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import path from 'path';
import fs from 'fs';

// deployment plugins
import 'hardhat-deploy';
import '@nomiclabs/hardhat-ethers';

dotenv.config();

function loadTasks() {
  const tasksPath = path.join(__dirname, 'tasks');
  fs.readdirSync(tasksPath).forEach((task) => {
    require(`${tasksPath}/${task}`);
  });
}

if (fs.existsSync(path.join(__dirname, 'artifacts'))) {
  loadTasks();
}

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.9',
    settings: {
      outputSelection: {
        '*': {
          '*': ['storageLayout'],
        },
      },
    },
  },
  namedAccounts: {
    deployer: 0,
  },
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {
      blockGasLimit: 12000000,
      accounts: {
        count: 20,
      },
    },
    localhostl1: {
      url: 'http://localhost:8545',
      companionNetworks: {
        l2: 'localhostl2',
      },
    },
    localhostl2: {
      url: 'http://localhost:8546',
      companionNetworks: {
        l1: 'localhostl1',
      },
    },
    rinkeby: {
      url: process.env.RINKEBY_URL || '',
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      companionNetworks: {
        l2: 'arbitrumRinkeby',
      },
    },
    rinkebyDevnet: {
      url: process.env.RINKEBY_URL || '',
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      companionNetworks: {
        l2: 'arbitrumRinkebyDevnet',
      },
    },
    nitroDevnet: {
      url: process.env.NITRO_DEVNET_URL || '',
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      companionNetworks: {
        l2: 'arbitrumNitroDevnet',
      },
    },
    arbitrumLocal: {
      url: 'http://localhost:8547',
      accounts: {
        mnemonic:
          'jar deny prosper gasp flush glass core corn alarm treat leg smart',
        path: 'm/44\'/60\'/0\'/0',
        initialIndex: 0,
        count: 10,
      },
      gasPrice: 0,
    },
    arbitrumRinkeby: {
      url: process.env.ARB_RINKEBY_URL || '',
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      companionNetworks: {
        l1: 'rinkeby',
      },
    },
    arbitrumRinkebyDevnet: {
      url: process.env.ARB_RINKEBY_URL || '',
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      companionNetworks: {
        l1: 'rinkebyDevnet',
      },
    },
    arbitrumNitroDevnet: {
      url: process.env.ARB_NITRO_DEVNET_URL || '',
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      companionNetworks: {
        l1: 'nitroDevnet',
      },
    },
    mainnet: {
      url: process.env.MAINNET_URL || '',
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      companionNetworks: {
        l2: 'arbitrumMainnet',
      },
    },
    arbitrumMainnet: {
      url: process.env.ARB_MAINNET_URL || '',
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
      companionNetworks: {
        l1: 'mainnet',
      },
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: 'USD',
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
};

export default config;
