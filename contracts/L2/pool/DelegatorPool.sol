//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

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

    function withdrawFees(address payable _recipient, uint256 _amount) external;
}

contract DelegatorPool is Initializable {
    uint256 public initialStake;
    uint256 public claimedInitialStake;

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
        initialStake = pendingStake();
    }

    function claim(address _delegator, uint256 _stake) external onlyMigrator {
        // Calculate original total stake

        require(
            claimedInitialStake < initialStake,
            "DelegatorPool#claim: FULLY_CLAIMED"
        );

        // Calculate Stake owed to delegator
        uint256 currTotalStake = pendingStake();
        uint256 owedStake = (currTotalStake * _stake) /
            (initialStake - claimedInitialStake);

        // Calculate fees owed to delegator
        uint256 currTotalFees = pendingFees();
        uint256 owedFees = (currTotalFees * _stake) /
            (initialStake - claimedInitialStake);

        // update claimed balance
        claimedInitialStake += _stake;

        // Transfer owed stake to the delegator
        transferBond(_delegator, owedStake);

        // Transfer owed fees to the delegator
        IBondingManager(bondingManager).withdrawFees(
            payable(_delegator),
            owedFees
        );

        emit Claimed(_delegator, owedStake, owedFees);
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
