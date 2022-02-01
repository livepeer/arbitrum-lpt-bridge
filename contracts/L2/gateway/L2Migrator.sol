// SPDX-License-Identifier: MIT
pragma solidity 0.8.8;

import {L2ArbitrumMessenger} from "./L2ArbitrumMessenger.sol";
import {IMigrator} from "../../interfaces/IMigrator.sol";

import "@openzeppelin/contracts/proxy/Clones.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

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
    ) external payable;
}

interface IMerkleSnapshot {
    function verify(
        bytes32 _id,
        bytes32[] memory _proof,
        bytes32 _leaf
    ) external view returns (bool);
}

interface IDelegatorPool {
    function initialize(address _bondingManager) external;

    function claim(address _addr, uint256 _stake) external;
}

contract L2Migrator is L2ArbitrumMessenger, IMigrator, AccessControl {
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

    event L1MigratorUpdate(address _l1Migrator);

    event MigrateDelegatorFinalized(MigrateDelegatorParams params);

    event MigrateUnbondingLocksFinalized(MigrateUnbondingLocksParams params);

    event MigrateSenderFinalized(MigrateSenderParams params);

    event DelegatorPoolImplUpdate(address _delegatorPoolImpl);

    event DelegatorPoolCreated(address indexed l1Addr, address delegatorPool);

    event ClaimStakeEnabled(bool _enabled);

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
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        l1Migrator = _l1Migrator;
        delegatorPoolImpl = _delegatorPoolImpl;
        bondingManagerAddr = _bondingManagerAddr;
        ticketBrokerAddr = _ticketBrokerAddr;
        merkleSnapshotAddr = _merkleSnapshotAddr;
    }

    /**
     * @notice Sets L1Migrator
     * @param _l1Migrator L1Migrator address
     */
    function setL1Migrator(address _l1Migrator)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        l1Migrator = _l1Migrator;
        emit L1MigratorUpdate(_l1Migrator);
    }

    /**
     * @notice Sets DelegatorPool implementation contract
     * @param _delegatorPoolImpl DelegatorPool implementation contract
     */
    function setDelegatorPoolImpl(address _delegatorPoolImpl)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        delegatorPoolImpl = _delegatorPoolImpl;
        emit DelegatorPoolImplUpdate(_delegatorPoolImpl);
    }

    /**
     * @notice Enable/disable claimStake()
     * @param _enabled True/false indicating claimStake() enabled/disabled
     */
    function setClaimStakeEnabled(bool _enabled)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        claimStakeEnabled = _enabled;
        emit ClaimStakeEnabled(_enabled);
    }

    /**
     * @notice Called by L1Migrator to complete transcoder/delegator state migration
     * @param _params L1 state relevant for migration
     */
    function finalizeMigrateDelegator(MigrateDelegatorParams calldata _params)
        external
        onlyL1Counterpart(l1Migrator)
    {
        require(
            !migratedDelegators[_params.l1Addr],
            "DELEGATOR_ALREADY_MIGRATED"
        );

        migratedDelegators[_params.l1Addr] = true;

        if (_params.l1Addr == _params.delegate) {
            // l1Addr is an orchestrator on L1:
            // 1. Stake _params.stake on behalf of _params.l2Addr
            // 2. Create delegator pool
            // 3. Stake non-self delegated stake on behalf of the delegator pool
            bondFor(_params.stake, _params.l2Addr, _params.l2Addr);

            address poolAddr = Clones.clone(delegatorPoolImpl);

            delegatorPools[_params.l1Addr] = poolAddr;

            // _params.delegatedStake includes _params.stake which is the orchestrator's self-stake
            // Subtract _params.stake to get the orchestrator's non-self delegated stake
            uint256 nonSelfDelegatedStake = _params.delegatedStake -
                _params.stake;
            bondFor(
                nonSelfDelegatedStake - claimedDelegatedStake[_params.l1Addr],
                poolAddr,
                _params.l2Addr
            );

            IDelegatorPool(poolAddr).initialize(bondingManagerAddr);

            emit DelegatorPoolCreated(_params.l1Addr, poolAddr);
        } else {
            // l1Addr is a delegator on L1:
            // If a delegator pool exists for _params.delegate claim stake which
            // was already migrated by delegate on behalf of _params.l2Addr.
            // Otherwise, stake _params.stake on behalf of _params.l2Addr.
            address pool = delegatorPools[_params.delegate];

            if (pool != address(0)) {
                // Claim stake that is held by the delegator pool
                IDelegatorPool(pool).claim(_params.l2Addr, _params.stake);
            } else {
                bondFor(_params.stake, _params.l2Addr, _params.delegate);
            }
        }

        claimedDelegatedStake[_params.delegate] += _params.stake;

        // Use .call() since l2Addr could be a contract that needs more gas than
        // the stipend provided by .transfer()
        // The .call() is safe without a re-entrancy guard because this function cannot be re-entered
        // by _params.l2Addr since the function can only be called by the L1Migrator via a cross-chain retryable ticket
        if (_params.fees > 0) {
            (bool ok, ) = _params.l2Addr.call{value: _params.fees}("");
            require(ok, "FINALIZE_DELEGATOR:FAIL_FEE");
        }

        emit MigrateDelegatorFinalized(_params);
    }

    /**
     * @notice Called by L1Migrator to complete unbonding locks migration
     * @param _params L1 state relevant for migration
     */
    function finalizeMigrateUnbondingLocks(
        MigrateUnbondingLocksParams calldata _params
    ) external onlyL1Counterpart(l1Migrator) {
        uint256 unbondingLockIdsLen = _params.unbondingLockIds.length;
        for (uint256 i = 0; i < unbondingLockIdsLen; i++) {
            uint256 id = _params.unbondingLockIds[i];
            require(
                !migratedUnbondingLocks[_params.l1Addr][id],
                "UNBONDING_LOCK_ALREADY_MIGRATED"
            );
            migratedUnbondingLocks[_params.l1Addr][id] = true;
        }

        bondFor(_params.total, _params.l2Addr, _params.delegate);

        emit MigrateUnbondingLocksFinalized(_params);
    }

    /**
     * @notice Called by L1Migrator to complete sender deposit/reserve migration
     * @param _params L1 state relevant for migration
     */
    function finalizeMigrateSender(MigrateSenderParams calldata _params)
        external
        onlyL1Counterpart(l1Migrator)
    {
        require(!migratedSenders[_params.l1Addr], "SENDER_ALREADY_MIGRATED");

        migratedSenders[_params.l1Addr] = true;

        // msg.value for this call must be equal to deposit + reserve amounts
        ITicketBroker(ticketBrokerAddr).fundDepositAndReserveFor{
            value: _params.deposit + _params.reserve
        }(_params.l2Addr, _params.deposit, _params.reserve);

        emit MigrateSenderFinalized(_params);
    }

    receive() external payable {}

    /**
     * @notice Completes delegator migration using a Merkle proof that a delegator's state was included in a state
     * snapshot represented by a Merkle tree root
     * @dev Assume that only EOAs are included in the snapshot
     * Regardless of the caller of this function, the EOA from L1 will be able to access its stake on L2
     * @param _delegate Address that is migrating
     * @param _stake Stake of delegator on L1
     * @param _fees Fees of delegator on L1
     * @param _proof Merkle proof of inclusion in Merkle tree state snapshot
     * @param _newDelegate Optional address of a new delegate on L2
     */
    function claimStake(
        address _delegate,
        uint256 _stake,
        uint256 _fees,
        bytes32[] calldata _proof,
        address _newDelegate
    ) external {
        require(claimStakeEnabled, "CLAIM_STAKE_DISABLED");

        address delegator = msg.sender;

        require(!migratedDelegators[delegator], "CLAIM_STAKE:ALREADY_MIGRATED");

        IMerkleSnapshot merkleSnapshot = IMerkleSnapshot(merkleSnapshotAddr);

        bytes32 leaf = keccak256(
            abi.encodePacked(delegator, _delegate, _stake, _fees)
        );

        require(
            merkleSnapshot.verify(keccak256("LIP-73"), _proof, leaf),
            "CLAIM_STAKE:INVALID_PROOF"
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
    ) private {
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
