import {task} from 'hardhat/config';
import {LivepeerToken} from '../typechain';

task('lpt-acl', 'Print LPT ACL').setAction(async (taskArgs, hre) => {
  const {deployments, ethers} = hre;

  const ADMIN_ROLE = ethers.constants.HashZero;
  const MINTER_ROLE = ethers.utils.solidityKeccak256(
      ['string'],
      ['MINTER_ROLE'],
  );
  const BURNER_ROLE = ethers.utils.solidityKeccak256(
      ['string'],
      ['BURNER_ROLE'],
  );

  const tokenDeployment = await deployments.get('LivepeerToken');
  const token: LivepeerToken = (await ethers.getContractAt(
      'LivepeerToken',
      tokenDeployment.address,
  )) as LivepeerToken;

  const startBlock = 5856156;
  const granted = await token.queryFilter(
      token.filters.RoleGranted(),
      startBlock,
  );
  const revoked = await token.queryFilter(
      token.filters.RoleRevoked(),
      startBlock,
  );

  const admins = [];
  const minters = [];
  const burners = [];

  for (const ev of granted) {
    if (ev.args.role === ADMIN_ROLE) {
      admins.push(ev.args.account);
    }
    if (ev.args.role === MINTER_ROLE) {
      minters.push(ev.args.account);
    }
    if (ev.args.role === BURNER_ROLE) {
      burners.push(ev.args.account);
    }
  }

  for (const ev of revoked) {
    if (ev.args.role === ADMIN_ROLE) {
      const idx = admins.indexOf(ev.args.account);
      if (idx > -1) admins.splice(idx, 1);
    }
    if (ev.args.role === MINTER_ROLE) {
      const idx = minters.indexOf(ev.args.account);
      if (idx > -1) minters.splice(idx, 1);
    }
    if (ev.args.role === BURNER_ROLE) {
      const idx = burners.indexOf(ev.args.account);
      if (idx > -1) burners.splice(idx, 1);
    }
  }

  console.log(`Admins: ${admins}`);
  console.log(`Minters: ${minters}`);
  console.log(`Burners: ${burners}`);
});
