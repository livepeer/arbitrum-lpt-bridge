export const L1_LPT = '0x58b6a8a3302369daec383334672404ee733ab239';

export const ARBITRUM_NETWORK: any = {
  mainnet: {
    l1GatewayRouter: '0x72Ce9c846789fdB6fC1f34aC4AD25Dd9ef7031ef',
    l2GatewayRouter: '0x5288c571Fd7aD117beA99bF60FE0846C4E84F933',
    inbox: '0x4Dbd4fc535Ac27206064B68FfCf827b0A60BAB3f',
    outbox: '0x760723CD2e632826c38Fef8CD438A4CC7E7E1A40',
    arbRetryableTx: '0x000000000000000000000000000000000000006E',
    nodeInterface: '0x00000000000000000000000000000000000000C8',
  },
  rinkeby: {
    l1GatewayRouter: '0x70C143928eCfFaf9F5b406f7f4fC28Dc43d68380',
    l2GatewayRouter: '0x9413AD42910c1eA60c737dB5f58d1C504498a3cD',
    inbox: '0x578BAde599406A8fE3d24Fd7f7211c0911F5B29e',
    outbox: '0x2360A33905dc1c72b12d975d975F42BaBdcef9F3',
    arbRetryableTx: '0x000000000000000000000000000000000000006E',
    nodeInterface: '0x00000000000000000000000000000000000000C8',
  },
  nitroGoerliDevnet: {
    l1GatewayRouter: '0x8BDFa67ace22cE2BFb2fFebe72f0c91CDA694d4b',
    l2GatewayRouter: '0xC502Ded1EE1d616B43F7f20Ebde83Be1A275ca3c',
    inbox: '0x1FdBBcC914e84aF593884bf8e8Dd6877c29035A2',
    outbox: '0xFDF2B11347dA17326BAF30bbcd3F4b09c4719584',
    arbRetryableTx: '0x000000000000000000000000000000000000006E',
    nodeInterface: '0x00000000000000000000000000000000000000C8',
  },
};

export const PROTOCOL_CONTRACTS: any = {
  mainnet: {
    bridgeMinter: '0x8dDDB96CF36AC8860f1DE5C7c4698fd499FAB405',
  },
};

export const ACL: any = {
  mainnet: {
    l1Escrow: {
      // L1 Governor
      admin: '0xFC3CBed6A3476F7616CC70f078397700136eEBFd',
    },
    l1Migrator: {
      // L1 governance multisig
      admin: '0x04746b890d090ae3c4c5dF0101CFD089A4FACA6C',
      // Asset migration initiator
      tempAdmin: '0xf410be5D9C64D4280091457355C0883324eB79A5',
    },
    l1LPTGateway: {
      // L1 governance multisig
      admin: '0x04746b890d090ae3c4c5dF0101CFD089A4FACA6C',
    },
  },
  arbitrumMainnet: {
    livepeerToken: {
      // L2 Governor
      admin: '0xD9dEd6f9959176F0A04dcf88a0d2306178A736a6',
    },
    l2Migrator: {
      // L2 Governor
      admin: '0xD9dEd6f9959176F0A04dcf88a0d2306178A736a6',
    },
    l2LPTGateway: {
      // L2 governance multisig
      admin: '0x04F53A0bb244f015cC97731570BeD26F0229da05',
    },
    l2LPTDataCache: {
      // L2 Governor
      admin: '0xD9dEd6f9959176F0A04dcf88a0d2306178A736a6',
    },
  },
};
