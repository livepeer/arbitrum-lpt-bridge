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
    uint256 public remainingStake;
    uint256 public cumulativeIncreaseRatio = 1;

    address public bondingManager;
    address public migrator;

    event Claimed(address _delegator, uint256 _stake, uint256 _fees);

    modifier onlyMigrator() {
        require(msg.sender == migrator, "DelegatorPool#claim: NOT_MIGRATOR");
        _;
    }

    function initialize(address _bondingManager) public initializer {
        bondingManager = _bondingManager;
        migrator = msg.sender;
        remainingStake = pendingStake();
    }

    receive() external payable {}

    function claim(address _delegator, uint256 _stake) external onlyMigrator {
        // Calculate original total stake
        uint256 currTotalStake = pendingStake();

        require(_stake <= currTotalStake, "DelegatorPool#claim: INVALID_STAKE");

        // Calculate Overall Increase ratio
        cumulativeIncreaseRatio *= currTotalStake / remainingStake;

        // Calculate Stake owed to delegator
        uint256 owedStake = cumulativeIncreaseRatio * _stake;

        // Calculate fees owed to delegator
        uint256 currTotalFees = pendingFees();
        uint256 owedFees = (cumulativeIncreaseRatio *
            currTotalFees *
            owedStake) / remainingStake;

        remainingStake = currTotalStake - owedStake;

        // Transfer owed stake to the delegator
        transferBond(_delegator, owedStake);

        // Transfer owed fees to the delegator
        IBondingManager(bondingManager).withdrawFees();

        (bool ok, ) = payable(_delegator).call{value: owedFees}("");
        require(ok, "DelegatorPool#claim: FAIL_FEE");

        emit Claimed(_delegator, _stake, owedFees);
    }

    function transferBond(address _delegator, uint256 _stake) public {
        IBondingManager(bondingManager).transferBond(
            _delegator,
            _stake,
            address(0),
            address(0),
            address(0),
            address(0)
        );
    }

    function pendingStake() public view returns (uint256) {
        return IBondingManager(bondingManager).pendingStake(address(this), 0);
    }

    function pendingFees() public view returns (uint256) {
        return IBondingManager(bondingManager).pendingFees(address(this), 0);
    }
}
