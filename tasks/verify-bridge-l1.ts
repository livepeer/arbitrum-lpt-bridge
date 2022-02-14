import {Contract} from 'ethers';
import {task} from 'hardhat/config';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

import {L1Escrow, L1LPTGateway, L1Migrator} from '../typechain';

task('verify-bridge-l1', 'prints ACL for L1 bridge contracts').setAction(
    async (_, hre: HardhatRuntimeEnvironment) => {
    // @ts-ignore
      const {deployments, ethers} = hre;
      const startBlock = 14185763;

      async function getEvents<T extends Contract>(name: string, role: string) {
        const deployment = await deployments.get(name);
        const contract: T = await ethers.getContractAt(name, deployment.address);

        const roleGrantedEvents = await contract.queryFilter(
            contract.filters.RoleGranted(),
            startBlock,
            'latest',
        );

        const roleRevokedEvents = await contract.queryFilter(
            contract.filters.RoleRevoked(),
            startBlock,
            'latest',
        );

        const grantedFiltered = roleGrantedEvents.filter(
            (event) => event.args?.role === role,
        );
        const revokedFiltered = roleRevokedEvents.filter(
            (event) => event.args?.role === role,
        );

        const grantedAccounts: string[] = [];
        grantedFiltered.map((event) => grantedAccounts.push(event.args?.account));

        const revokedAccounts: string[] = [];
        revokedFiltered.map((event) => revokedAccounts.push(event.args?.account));

        return grantedAccounts.filter((account) => {
          return !revokedAccounts.includes(account);
        });
      }

      const ADMIN_ROLE = ethers.constants.HashZero;

      const l1EscrowAdmins = await getEvents<L1Escrow>('L1Escrow', ADMIN_ROLE);

      const l1MigratorAdmins = await getEvents<L1Migrator>(
          'L1Migrator',
          ADMIN_ROLE,
      );

      const l1LPTGatewayAdmins = await getEvents<L1LPTGateway>(
          'L1LPTGateway',
          ADMIN_ROLE,
      );

      console.log({
        l1EscrowAdmins,
        l1MigratorAdmins,
        l1LPTGatewayAdmins,
      });
    },
);
