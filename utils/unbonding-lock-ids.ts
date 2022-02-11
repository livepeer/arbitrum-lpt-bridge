import ethers from 'ethers';

export const getUnbondingLockIds = async (
    bondingManager: ethers.Contract,
    l1Addr: string,
) => {
  const unbondingLockIds = [];
  const nextUnbondingLockId = (await bondingManager.getDelegator(l1Addr))
      .nextUnbondingLockId;
  for (let i = 0; i < nextUnbondingLockId.toNumber(); i++) {
    const lock = await bondingManager.getDelegatorUnbondingLock(l1Addr, i);
    if (!lock.amount.isZero()) {
      unbondingLockIds.push(i);
    }
  }

  return unbondingLockIds;
};
