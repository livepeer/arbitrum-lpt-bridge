pragma solidity 0.8.9;

interface IBondingManagerOverride {
    function bondForWithHint(
        uint256 _amount,
        address _owner,
        address _to,
        address _oldDelegateNewPosPrev,
        address _oldDelegateNewPosNext,
        address _newDelegateNewPosPrev,
        address _newDelegateNewPosNext
    ) external;

    function getDelegator(address _addr)
        external
        view
        returns (
            uint256 bondedAmount,
            uint256 fees,
            address delegateAddress,
            uint256 delegatedAmount,
            uint256 startRound,
            uint256 lastClaimRound,
            uint256 nextUnbondingLockId
        );

    function getDelegatorUnbondingLock(address _addr, uint256 _unbondingLockId)
        external
        view
        returns (uint256 amount, uint256 withdrawRound);
}