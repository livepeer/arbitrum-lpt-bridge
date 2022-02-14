import {Contract, ethers} from 'ethers';
import {task} from 'hardhat/config';
import {HardhatRuntimeEnvironment} from 'hardhat/types';

import {
  IController,
  L2LPTDataCache,
  L2LPTGateway,
  L2Migrator,
  LivepeerToken,
} from '../typechain';

task('verify-bridge-l2', 'prints ACL for L2 bridge contracts').setAction(
    async (_, hre: HardhatRuntimeEnvironment) => {
    // @ts-ignore
      const {deployments, ethers} = hre;
      const startBlock = 5322556;

      const batchQueryFilter = async (contract: ethers.Contract, filter: ethers.EventFilter, startBlock: number, latestBlock: number) => {
        const batchSize = 100000;
        const events = [];
        for (let i = startBlock; i < latestBlock; i += batchSize) {
          const batchEvents = await contract.queryFilter(
              filter,
              i,
              i + batchSize - 1,
          );
          events.push(...batchEvents);
        }
        return events;
      };

      async function getEvents<T extends Contract>(name: string, role: string) {
        const deployment = await deployments.get(name);
        const contract: T = await ethers.getContractAt(name, deployment.address);

        const latestBlock = await ethers.provider.getBlockNumber();

        const roleGrantedEvents = await batchQueryFilter(
            contract,
            contract.filters.RoleGranted(),
            startBlock,
            latestBlock,
        );

        const roleRevokedEvents = await batchQueryFilter(
            contract,
            contract.filters.RoleRevoked(),
            startBlock,
            latestBlock,
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
      const MINTER_ROLE = ethers.utils.solidityKeccak256(
          ['string'],
          ['MINTER_ROLE'],
      );
      const BURNER_ROLE = ethers.utils.solidityKeccak256(
          ['string'],
          ['BURNER_ROLE'],
      );

      const tokenAdmins = await getEvents<LivepeerToken>(
          'LivepeerToken',
          ADMIN_ROLE,
      );

      const tokenMinters = await getEvents<LivepeerToken>(
          'LivepeerToken',
          MINTER_ROLE,
      );
      const tokenBurners = await getEvents<LivepeerToken>(
          'LivepeerToken',
          BURNER_ROLE,
      );

      const l2LPTGatewayAdmins = await getEvents<L2LPTGateway>(
          'L2LPTGateway',
          ADMIN_ROLE,
      );

      const l2LPTDataCacheDeployment = await deployments.get('L2LPTDataCache');
      const l2LPTDataCache: L2LPTDataCache = await ethers.getContractAt(
          'L2LPTDataCache',
          l2LPTDataCacheDeployment.address,
      );
      const l2LPTDataCacheOwner = await l2LPTDataCache.owner();

      const l2MigratorDeployment = await deployments.get('L2MigratorProxy');
      const l2Migrator: L2Migrator = await ethers.getContractAt(
          'L2Migrator',
          l2MigratorDeployment.address,
      );
      const l2MigratorController = await l2Migrator.controller();
      const controller: IController = await ethers.getContractAt(
          'IController',
          l2MigratorController,
      );
      const l2MigratorOwner = await controller.owner();

      console.log({
        tokenAdmins,
        tokenMinters,
        tokenBurners,
        l2MigratorOwner,
        l2MigratorController,
        l2LPTGatewayAdmins,
        l2LPTDataCacheOwner,
      });
    },
);
