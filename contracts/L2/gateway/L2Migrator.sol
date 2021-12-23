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

contract L2Migrator is L2ArbitrumMessenger, IMigrator {
    address public immutable bondingManagerAddr;
    address public immutable ticketBrokerAddr;

    address public l1Migrator;
    address public delegatorPoolImpl;

    mapping(address => bool) public migratedDelegators;
    mapping(address => address) public delegatorPools;
    mapping(address => mapping(uint256 => bool)) public migratedUnbondingLocks;
    mapping(address => bool) public migratedSenders;

    event MigrateDelegatorFinalized(MigrateDelegatorParams params);

    event MigrateUnbondingLocksFinalized(MigrateUnbondingLocksParams params);

    event MigrateSenderFinalized(MigrateSenderParams params);

    event DelegatorPoolCreated(address indexed l1Addr, address delegatorPool);

    constructor(
        address _l1Migrator,
        address _delegatorPoolImpl,
        address _bondingManagerAddr,
        address _ticketBrokerAddr
    ) {
        l1Migrator = _l1Migrator;
        delegatorPoolImpl = _delegatorPoolImpl;
        bondingManagerAddr = _bondingManagerAddr;
        ticketBrokerAddr = _ticketBrokerAddr;
    }

    // TODO: Add auth
    function setL1Migrator(address _l1Migrator) external {
        l1Migrator = _l1Migrator;
    }

    // TODO: Setter for delegatorPoolImpl?

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

            // TODO: Subtract already claimed delegated stake
            bondFor(_params.delegatedStake, poolAddr, _params.delegate);

            emit DelegatorPoolCreated(_params.l1Addr, poolAddr);
        }

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
