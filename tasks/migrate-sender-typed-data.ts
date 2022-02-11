import {task} from 'hardhat/config';
import {L1MigratorAuth} from '../utils/migration-auth';

task('migrate-sender-typed-data', 'Return typed data for migrateSender auth')
    .addParam('l1addr', 'L1 address')
    .addParam('l2addr', 'L2 address')
    .setAction(async (taskArgs, hre) => {
      const {getChainId, deployments} = hre;

      const l1MigratorDeployment = await deployments.get('L1Migrator');

      const auth = new L1MigratorAuth(
          l1MigratorDeployment.address,
          parseInt(await getChainId()),
      );

      console.log(
          JSON.stringify(
              auth.migrateSenderTypedData(taskArgs.l1addr, taskArgs.l2addr),
              null,
              2,
          ),
      );
    });
