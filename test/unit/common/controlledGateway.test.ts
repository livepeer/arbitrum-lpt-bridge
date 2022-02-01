import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {expect} from 'chai';
import {ethers} from 'hardhat';
import {
  ControlledGateway,
  ControlledGateway__factory,
  LivepeerToken,
  LivepeerToken__factory,
} from '../../../typechain';
import {L1_LPT} from '../../../deploy/constants';

describe('ControlledGateway', function() {
  let token: LivepeerToken;
  let gateway: ControlledGateway;
  let owner: SignerWithAddress;
  let notOwner: SignerWithAddress;
  let admin: SignerWithAddress;
  let admin2: SignerWithAddress;

  const ADMIN_ROLE =
    '0x0000000000000000000000000000000000000000000000000000000000000000';

  beforeEach(async function() {
    const signers = await ethers.getSigners();
    owner = signers[0];
    admin = signers[1];
    admin2 = signers[2];
    notOwner = signers[3];

    const Token: LivepeerToken__factory = await ethers.getContractFactory(
        'LivepeerToken',
    );
    token = await Token.deploy();
    await token.deployed();

    const Gateway: ControlledGateway__factory = await ethers.getContractFactory(
        'ControlledGateway',
    );
    gateway = await Gateway.deploy(L1_LPT, token.address);
    await gateway.deployed();
  });

  it('should correctly set admin', async function() {
    const hasAdminRole = await gateway.hasRole(ADMIN_ROLE, owner.address);
    expect(hasAdminRole).to.be.true;
  });

  describe('AccessControl', async function() {
    describe('add admin', async function() {
      describe('caller is not admin', async function() {
        it('should not be able to set admin', async function() {
          const tx = gateway
              .connect(notOwner)
              .grantRole(ADMIN_ROLE, admin.address);

          await expect(tx).to.be.revertedWith(
              // eslint-disable-next-line
            `AccessControl: account ${notOwner.address.toLowerCase()} is missing role ${ADMIN_ROLE}`
          );
        });
      });

      describe('caller is admin', async function() {
        it('should set admin', async function() {
          await gateway.grantRole(ADMIN_ROLE, admin.address);

          const hasControllerRole = await gateway.hasRole(
              ADMIN_ROLE,
              admin.address,
          );
          expect(hasControllerRole).to.be.true;
        });
      });
    });

    describe('pause', async function() {
      beforeEach(async function() {
        await gateway.grantRole(ADMIN_ROLE, admin.address);
      });

      describe('caller is not admin', async function() {
        it('should not be able to pause system', async function() {
          const tx = gateway.connect(notOwner).pause();

          await expect(tx).to.be.revertedWith(
              // eslint-disable-next-line
            `AccessControl: account ${notOwner.address.toLowerCase()} is missing role ${ADMIN_ROLE}`
          );
        });
      });

      describe('caller is admin', async function() {
        it('should pause system', async function() {
          await gateway.connect(admin).pause();

          const isPaused = await gateway.paused();
          expect(isPaused).to.be.true;
        });
      });
    });

    describe('unpause', async function() {
      beforeEach(async function() {
        await gateway.grantRole(ADMIN_ROLE, admin.address);
        await gateway.connect(admin).pause();

        const isPaused = await gateway.paused();
        expect(isPaused).to.be.true;
      });

      describe('caller is not admin', async function() {
        it('should not be able to unpause system', async function() {
          const tx = gateway.connect(notOwner).unpause();

          await expect(tx).to.be.revertedWith(
              // eslint-disable-next-line
            `AccessControl: account ${notOwner.address.toLowerCase()} is missing role ${ADMIN_ROLE}`
          );
        });
      });

      describe('caller is admin', async function() {
        it('should unpause system', async function() {
          await gateway.connect(admin).unpause();

          const isPaused = await gateway.paused();
          expect(isPaused).to.be.false;
        });
      });
    });
  });

  describe('Pausable', async function() {
    beforeEach(async function() {
      await gateway.grantRole(ADMIN_ROLE, admin.address);
    });

    describe('contract is not paused', async function() {
      it('should call function', async function() {
        await gateway.grantRole(ADMIN_ROLE, admin2.address);

        const hasControllerRole = await gateway.hasRole(
            ADMIN_ROLE,
            admin2.address,
        );
        expect(hasControllerRole).to.be.true;
      });
    });

    describe('contract is paused', async function() {
      beforeEach(async function() {
        await gateway.connect(admin).pause();
      });

      it('should fail to call function', async function() {
        const tx = gateway.connect(admin).pause();

        await expect(tx).to.be.revertedWith('Pausable: paused');
      });
    });
  });
});
