import {ethers} from 'ethers';

export class L1MigratorAuth {
  l1Migrator: string;
  chainId: number;

  types: any;

  constructor(l1Migrator: string, chainId: number) {
    this.l1Migrator = l1Migrator;
    this.chainId = chainId;

    this.types = {
      migrateSender: {
        MigrateSender: [
          {name: 'l1Addr', type: 'address'},
          {name: 'l2Addr', type: 'address'},
        ],
      },
    };
  }

  migrateSenderTypedData(l1Addr: string, l2Addr: string): any {
    const value = {
      l1Addr,
      l2Addr,
    };
    return ethers.utils._TypedDataEncoder.getPayload(
        this.domain(),
        this.types.migrateSender,
        value,
    );
  }

  domain(): any {
    return {
      name: 'Livepeer L1Migrator',
      version: '1',
      chainId: this.chainId,
      verifyingContract: this.l1Migrator,
    };
  }
}
