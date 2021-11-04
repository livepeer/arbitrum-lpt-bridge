import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {expect} from 'chai';
import {ethers} from 'hardhat';
import {
  ControlledGateway,
  ControlledGateway__factory,
  LivepeerToken,
  LivepeerToken__factory,
} from '../../typechain';

describe('L1 Gateway', function() {
  let token: LivepeerToken;
  let gateway: ControlledGateway;
  let owner: SignerWithAddress;
  let notOwner: SignerWithAddress;
  let governanceController: SignerWithAddress;
  let governanceController2: SignerWithAddress;

  const ADMIN_ROLE =
    '0x0000000000000000000000000000000000000000000000000000000000000000';

  const GOVERNANCE_CONTROLLER_ROLE = ethers.utils.solidityKeccak256(
      ['string'],
      ['GOVERNANCE_CONTROLLER'],
  );

  beforeEach(async function() {
    const signers = await ethers.getSigners();
    owner = signers[0];
    governanceController = signers[1];
    governanceController2 = signers[2];
    notOwner = signers[3];

    const Token: LivepeerToken__factory = await ethers.getContractFactory(
        'LivepeerToken',
    );
    token = await Token.deploy();
    await token.deployed();

    const Gateway: ControlledGateway__factory = await ethers.getContractFactory(
        'ControlledGateway',
    );
    gateway = await Gateway.deploy(token.address);
    await gateway.deployed();
  });

  it('should correctly set admin', async function() {
    const hasAdminRole = await gateway.hasRole(ADMIN_ROLE, owner.address);
    expect(hasAdminRole).to.be.true;
  });

  describe('AccessControl', async function() {
    describe('addGovernanceController', async function() {
      describe('caller is not admin', async function() {
        it('should not be able to set governance controller', async function() {
          const tx = gateway
              .connect(notOwner)
              .addGovernanceController(governanceController.address);

          await expect(tx).to.be.revertedWith(
              // eslint-disable-next-line
            `AccessControl: account ${notOwner.address.toLowerCase()} is missing role ${ADMIN_ROLE}`
          );
        });
      });

      describe('caller is admin', async function() {
        it('should set governance controller', async function() {
          await gateway.addGovernanceController(governanceController.address);

          const hasControllerRole = await gateway.hasRole(
              GOVERNANCE_CONTROLLER_ROLE,
              governanceController.address,
          );
          expect(hasControllerRole).to.be.true;
        });
      });
    });

    describe('pause', async function() {
      beforeEach(async function() {
        await gateway.addGovernanceController(governanceController.address);
      });

      describe('caller is not governance controller', async function() {
        it('should not be able to pause system', async function() {
          const tx = gateway.pause();

          await expect(tx).to.be.revertedWith(
              // eslint-disable-next-line
            `AccessControl: account ${owner.address.toLowerCase()} is missing role ${GOVERNANCE_CONTROLLER_ROLE}`
          );
        });
      });

      describe('caller is governance controller', async function() {
        it('should pause system', async function() {
          await gateway.connect(governanceController).pause();

          const isPaused = await gateway.paused();
          expect(isPaused).to.be.true;
        });
      });
    });

    describe('unpause', async function() {
      beforeEach(async function() {
        await gateway.addGovernanceController(governanceController.address);
        await gateway.connect(governanceController).pause();

        const isPaused = await gateway.paused();
        expect(isPaused).to.be.true;
      });

      describe('caller is not governance controller', async function() {
        it('should not be able to unpause system', async function() {
          const tx = gateway.unpause();

          await expect(tx).to.be.revertedWith(
              // eslint-disable-next-line
            `AccessControl: account ${owner.address.toLowerCase()} is missing role ${GOVERNANCE_CONTROLLER_ROLE}`
          );
        });
      });

      describe('caller is governance controller', async function() {
        it('should unpause system', async function() {
          await gateway.connect(governanceController).unpause();

          const isPaused = await gateway.paused();
          expect(isPaused).to.be.false;
        });
      });
    });
  });

  describe('Pausable', async function() {
    beforeEach(async function() {
      await gateway.addGovernanceController(governanceController.address);
    });

    describe('contract is not paused', async function() {
      it('should call function', async function() {
        await gateway.addGovernanceController(governanceController2.address);

        const hasControllerRole = await gateway.hasRole(
            GOVERNANCE_CONTROLLER_ROLE,
            governanceController2.address,
        );
        expect(hasControllerRole).to.be.true;
      });
    });

    describe('contract is paused', async function() {
      beforeEach(async function() {
        await gateway.connect(governanceController).pause();
      });

      it('should fail to call function', async function() {
        const tx = gateway.addGovernanceController(
            governanceController2.address,
        );

        await expect(tx).to.be.revertedWith('Pausable: paused');
      });
    });
  });
});
