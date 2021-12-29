//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "./MathUtils.sol";

interface IBondingManager {
    function pendingStake(address _addr, uint256 _endRound)
        external
        view
        returns (uint256);

    function pendingFees(address _addr, uint256 _endRound)
        external
        view
        returns (uint256);

    function transferBond(
        address _delegator,
        uint256 _amount,
        address _oldDelegateNewPosPrev,
        address _oldDelegateNewPosNext,
        address _newDelegateNewPosPrev,
        address _newDelegateNewPosNext
    ) external;

    function withdrawFees() external;
}

contract DelegatorPool is Initializable {
    uint256 public totalClaimedStake;

    address public bondingManager;
    address public migrator;

    event Claimed(address _delegator, uint256 _stake, uint256 _fees);

    modifier onlyMigrator() {
        require(msg.sender == migrator, "DelegatorPool#claim: NOT_MIGRATOR");
        _;
    }

    function initialize(address _migrator, address _bondingManager)
        public
        initializer
    {
        migrator = _migrator;
        bondingManager = _bondingManager;
    }

    function claim(address _delegator, uint256 _stake) external onlyMigrator {
        // Calculate original total stake
        uint256 currTotalStake = IBondingManager(bondingManager).pendingStake(
            address(this),
            0
        );
        uint256 totalStake = currTotalStake + totalClaimedStake;

        // Calculate stake owed to delegator
        uint256 owedStake = MathUtils.percOf(
            currTotalStake,
            _stake,
            totalStake
        );

        // Transfer owed stake to the delegator
        IBondingManager(bondingManager).transferBond(
            _delegator,
            owedStake,
            address(0),
            address(0),
            address(0),
            address(0)
        );

        // Calculate fees owed to delegator
        uint256 totalFees = IBondingManager(bondingManager).pendingFees(
            address(this),
            0
        );
        uint256 owedFees = MathUtils.percOf(totalFees, _stake, totalStake);

        // Transfer owed fees to the delegator
        IBondingManager(bondingManager).withdrawFees();

        (bool ok, ) = _delegator.call{value: owedFees}("");
        require(ok, "DelegatorPool#claim: FAIL_FEE");

        totalClaimedStake += _stake;

        emit Claimed(_delegator, _stake, owedFees);
    }
}
