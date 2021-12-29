// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {L2ArbitrumMessenger} from "./L2ArbitrumMessenger.sol";
import {IMigrator} from "../../interfaces/IMigrator.sol";

import "@openzeppelin/contracts/proxy/Clones.sol";

interface IBondingManager {
    function bondForWithHint(
        uint256 _amount,
        address _owner,
        address _to,
        address _oldDelegateNewPosPrev,
        address _oldDelegateNewPosNext,
        address _newDelegateNewPosPrev,
        address _newDelegateNewPosNext
    ) external;
}

interface ITicketBroker {
    function fundDepositAndReserveFor(
        address _addr,
        uint256 _depositAmount,
        uint256 _reserveAmount
    ) external;
}

interface IMerkleSnapshot {
    function verify(
        bytes32 _id,
        bytes32[] memory _proof,
        bytes32 _leaf
    ) external view returns (bool);
}

interface IDelegatorPool {
    function claim(address _addr, uint256 _stake) external;
}

contract L2Migrator is L2ArbitrumMessenger, IMigrator {
    address public immutable bondingManagerAddr;
    address public immutable ticketBrokerAddr;
    address public immutable merkleSnapshotAddr;

    address public l1Migrator;
    address public delegatorPoolImpl;
    bool public claimStakeEnabled;

    mapping(address => bool) public migratedDelegators;
    mapping(address => address) public delegatorPools;
    mapping(address => uint256) public claimedDelegatedStake;
    mapping(address => mapping(uint256 => bool)) public migratedUnbondingLocks;
    mapping(address => bool) public migratedSenders;

    event MigrateDelegatorFinalized(MigrateDelegatorParams params);

    event MigrateUnbondingLocksFinalized(MigrateUnbondingLocksParams params);

    event MigrateSenderFinalized(MigrateSenderParams params);

    event DelegatorPoolCreated(address indexed l1Addr, address delegatorPool);

    event StakeClaimed(
        address indexed delegator,
        address delegate,
        uint256 stake,
        uint256 fees
    );

    constructor(
        address _l1Migrator,
        address _delegatorPoolImpl,
        address _bondingManagerAddr,
        address _ticketBrokerAddr,
        address _merkleSnapshotAddr
    ) {
        l1Migrator = _l1Migrator;
        delegatorPoolImpl = _delegatorPoolImpl;
        bondingManagerAddr = _bondingManagerAddr;
        ticketBrokerAddr = _ticketBrokerAddr;
        merkleSnapshotAddr = _merkleSnapshotAddr;
    }

    // TODO: Add auth
    function setL1Migrator(address _l1Migrator) external {
        l1Migrator = _l1Migrator;
    }

    // TODO: Setter for delegatorPoolImpl?

    // TODO: Add auth
    function setClaimStakeEnabled(bool _enabled) external {
        claimStakeEnabled = _enabled;
    }

    function finalizeMigrateDelegator(MigrateDelegatorParams memory _params)
        external
        onlyL1Counterpart(l1Migrator)
    {
        require(
            !migratedDelegators[_params.l1Addr],
            "L2Migrator#finalizeMigrateDelegator: ALREADY_MIGRATED"
        );

        migratedDelegators[_params.l1Addr] = true;

        bondFor(_params.stake, _params.l2Addr, _params.delegate);

        if (_params.l1Addr == _params.delegate) {
            address poolAddr = Clones.clone(delegatorPoolImpl);
            delegatorPools[_params.l1Addr] = poolAddr;

            bondFor(
                _params.delegatedStake - claimedDelegatedStake[_params.l1Addr],
                poolAddr,
                _params.delegate
            );

            emit DelegatorPoolCreated(_params.l1Addr, poolAddr);
        }

        claimedDelegatedStake[_params.delegate] += _params.stake;

        // Use .call() since l2Addr could be a contract that needs more gas than
        // the stipend provided by .transfer()
        // The .call() is safe without a re-entrancy guard because this function cannot be re-entered
        // by _params.l2Addr since the function can only be called by the L1Migrator via a cross-chain retryable ticket
        if (_params.fees > 0) {
            (bool ok, ) = _params.l2Addr.call{value: _params.fees}("");
            require(ok, "L2Migrator#finalizeMigrateDelegator: FAIL_FEE");
        }

        emit MigrateDelegatorFinalized(_params);
    }

    function finalizeMigrateUnbondingLocks(
        MigrateUnbondingLocksParams memory _params
    ) external onlyL1Counterpart(l1Migrator) {
        for (uint256 i = 0; i < _params.unbondingLockIds.length; i++) {
            uint256 id = _params.unbondingLockIds[i];
            require(
                !migratedUnbondingLocks[_params.l1Addr][id],
                "L2Migrator#finalizeMigrateUnbondingLocks: ALREADY_MIGRATED"
            );
            migratedUnbondingLocks[_params.l1Addr][id] = true;
        }

        bondFor(_params.total, _params.l2Addr, _params.delegate);

        emit MigrateUnbondingLocksFinalized(_params);
    }

    function finalizeMigrateSender(MigrateSenderParams memory _params)
        external
        onlyL1Counterpart(l1Migrator)
    {
        require(
            !migratedSenders[_params.l1Addr],
            "L2Migrator#finalizeMigrateSender: ALREADY_MIGRATED"
        );

        migratedSenders[_params.l1Addr] = true;

        ITicketBroker(ticketBrokerAddr).fundDepositAndReserveFor(
            _params.l2Addr,
            _params.deposit,
            _params.reserve
        );

        emit MigrateSenderFinalized(_params);
    }

    receive() external payable {}

    // Assume that only EOAs are included in the snapshot
    // Regardless of the caller of this function, the EOA from L1 will be able to access its stake on L2
    function claimStake(
        address _delegate,
        uint256 _stake,
        uint256 _fees,
        bytes32[] calldata _proof,
        address _newDelegate
    ) external {
        require(
            claimStakeEnabled,
            "L2Migrator#claimStake: CLAIM_STAKE_DISABLED"
        );

        IMerkleSnapshot merkleSnapshot = IMerkleSnapshot(merkleSnapshotAddr);

        address delegator = msg.sender;
        bytes32 leaf = keccak256(
            abi.encodePacked(delegator, _delegate, _stake, _fees)
        );

        require(
            merkleSnapshot.verify(keccak256("LIP-73"), _proof, leaf),
            "L2Migrator#claimStake: INVALID_PROOF"
        );

        require(
            !migratedDelegators[delegator],
            "L2Migrator#claimStake: ALREADY_MIGRATED"
        );

        migratedDelegators[delegator] = true;
        claimedDelegatedStake[_delegate] += _stake;

        address pool = delegatorPools[_delegate];

        address delegate = _delegate;
        if (_newDelegate != address(0)) {
            delegate = _newDelegate;
        }

        if (pool != address(0)) {
            // Claim stake that is held by the delegator pool
            IDelegatorPool(pool).claim(delegator, _stake);
        } else {
            bondFor(_stake, delegator, delegate);
        }

        // Only EOAs are included in the snapshot so we do not need to worry about
        // the insufficeint gas stipend with transfer()
        if (_fees > 0) {
            payable(delegator).transfer(_fees);
        }

        emit StakeClaimed(delegator, delegate, _stake, _fees);
    }

    function bondFor(
        uint256 _amount,
        address _owner,
        address _to
    ) internal {
        IBondingManager bondingManager = IBondingManager(bondingManagerAddr);

        bondingManager.bondForWithHint(
            _amount,
            _owner,
            _to,
            address(0),
            address(0),
            address(0),
            address(0)
        );
    }
}
