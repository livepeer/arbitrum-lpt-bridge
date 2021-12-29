import {FakeContract, smock} from '@defi-wonderland/smock';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/dist/src/signers';
import {expect, use} from 'chai';

import {ethers} from 'hardhat';
import {DelegatorPool, DelegatorPool__factory} from '../../../typechain';

use(smock.matchers);

describe('DelegatorPool', function() {
  let delegatorPool: DelegatorPool;

  let bondingManagerMock: FakeContract;

  let delegator: SignerWithAddress;
  let delegator1: SignerWithAddress;
  let delegator2: SignerWithAddress;
  let mockL2MigratorEOA: SignerWithAddress;
  let mockBondingManagerEOA: SignerWithAddress;

  const pendingStake = 900;
  const pendingFees = 90;

  beforeEach(async function() {
    [
      delegator,
      delegator1,
      delegator2,
      mockL2MigratorEOA,
      mockBondingManagerEOA,
    ] = await ethers.getSigners();

    const DelegatorPool: DelegatorPool__factory =
      await ethers.getContractFactory('DelegatorPool');

    delegatorPool = await DelegatorPool.deploy();

    bondingManagerMock = await smock.fake(
        'contracts/L2/pool/DelegatorPool.sol:IBondingManager',
        {
          address: mockBondingManagerEOA.address,
        },
    );

    bondingManagerMock.pendingStake.returns(pendingStake);
    bondingManagerMock.pendingFees.returns(pendingFees);

    await delegatorPool
        .connect(mockL2MigratorEOA)
        .initialize(mockBondingManagerEOA.address);
  });

  describe('initialize', () => {
    it('sets addresses correctly', async () => {
      const bondingManagerAddr = await delegatorPool.bondingManager();
      expect(bondingManagerAddr).to.equal(mockBondingManagerEOA.address);

      const migratorAddr = await delegatorPool.migrator();
      expect(migratorAddr).to.equal(mockL2MigratorEOA.address);
    });

    it('sets initial balance correctly', async () => {
      const remainingStake = await delegatorPool.remainingStake();
      expect(remainingStake).to.equal(pendingStake);
    });

    it('should fail when already initialized', async () => {
      const tx = delegatorPool.initialize(mockBondingManagerEOA.address);
      await expect(tx).to.be.revertedWith(
          'Initializable: contract is already initialized',
      );
    });
  });

  describe('claim', () => {
    describe('caller is not migrator', () => {
      it('fails when called claim', async () => {
        const tx = delegatorPool.connect(delegator).claim(delegator.address, 1);
        await expect(tx).to.be.revertedWith(
            'DelegatorPool#claim: NOT_MIGRATOR',
        );
      });
    });

    describe('caller is migrator', () => {
      const stake = 900;
      const fees = 90;

      describe('full claim - only single delegator in pool', () => {
        beforeEach(async function() {
          // mimic bondingManager.withdrawFees()
          await mockBondingManagerEOA.sendTransaction({
            to: delegatorPool.address,
            value: fees,
          });
        });

        it('fails to transfer is fee higher than balance', async () => {
          bondingManagerMock.pendingFees.returns(fees + 100);

          const tx = delegatorPool
              .connect(mockL2MigratorEOA)
              .claim(delegator.address, stake);

          await expect(tx).to.be.revertedWith('DelegatorPool#claim: FAIL_FEE');
        });

        it('fails if incorrect stake is provided', async () => {
          const invalidStake = stake + 100;

          const tx = delegatorPool
              .connect(mockL2MigratorEOA)
              .claim(delegator.address, invalidStake);

          await expect(tx).to.be.revertedWith(
              'DelegatorPool#claim: INVALID_STAKE',
          );
        });

        it('claim stake and fee', async () => {
          const tx = await delegatorPool
              .connect(mockL2MigratorEOA)
              .claim(delegator.address, stake);

          expect(bondingManagerMock.transferBond).to.be.calledOnceWith(
              delegator.address,
              stake,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
          );

          await expect(tx).to.changeEtherBalance(delegator, fees);

          await expect(tx)
              .to.emit(delegatorPool, 'Claimed')
              .withArgs(delegator.address, stake, fees);
        });

        it('emits claimed event', async () => {
          const tx = await delegatorPool
              .connect(mockL2MigratorEOA)
              .claim(delegator.address, stake);

          await expect(tx)
              .to.emit(delegatorPool, 'Claimed')
              .withArgs(delegator.address, stake, fees);
        });
      });

      describe('proportional claim - multiple delegators in pool', () => {
        it('no rewards/no increase in stake', async () => {
          await mockBondingManagerEOA.sendTransaction({
            to: delegatorPool.address,
            value: 90,
          });

          bondingManagerMock.pendingStake.returns(900);
          bondingManagerMock.pendingFees.returns(90);

          const tx1 = await delegatorPool
              .connect(mockL2MigratorEOA)
              .claim(delegator.address, 200);

          expect(bondingManagerMock.transferBond.atCall(0)).to.be.calledWith(
              delegator.address,
              200,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
          );

          expect(tx1).to.changeEtherBalance(delegator, 20);

          bondingManagerMock.pendingStake.returns(700);
          bondingManagerMock.pendingFees.returns(70);

          const tx2 = await delegatorPool
              .connect(mockL2MigratorEOA)
              .claim(delegator1.address, 300);

          expect(bondingManagerMock.transferBond.atCall(1)).to.be.calledWith(
              delegator1.address,
              300,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
          );

          expect(tx2).to.changeEtherBalance(delegator1, 30);

          bondingManagerMock.pendingStake.returns(400);
          bondingManagerMock.pendingFees.returns(40);

          const tx3 = await delegatorPool
              .connect(mockL2MigratorEOA)
              .claim(delegator2.address, 400);

          expect(bondingManagerMock.transferBond.atCall(2)).to.be.calledWith(
              delegator2.address,
              400,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
              ethers.constants.AddressZero,
          );

          expect(tx3).to.changeEtherBalance(delegator2, 40);
        });
      });
    });
  });
});
