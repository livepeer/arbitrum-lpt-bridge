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

contract L2Migrator is L2ArbitrumMessenger, IMigrator {
    address public immutable bondingManagerAddr;

    address public l1Migrator;
    address public delegatorPoolImpl;

    mapping(address => bool) public migratedDelegators;
    mapping(address => address) public delegatorPools;

    event MigrateDelegatorFinalized(MigrateDelegatorParams params);

    event MigrateUnbondingLocksFinalized(MigrateUnbondingLocksParams params);

    event MigrateSenderFinalized(MigrateSenderParams params);

    event DelegatorPoolCreated(address indexed l1Addr, address delegatorPool);

    constructor(
        address _l1Migrator,
        address _delegatorPoolImpl,
        address _bondingManagerAddr
    ) {
        l1Migrator = _l1Migrator;
        delegatorPoolImpl = _delegatorPoolImpl;
        bondingManagerAddr = _bondingManagerAddr;
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
        // TODO: Check if claimed

        migratedDelegators[_params.l1Addr] = true;

        bondFor(_params.stake, _params.l2Addr, _params.delegate);

        if (_params.l1Addr == _params.delegate) {
            address poolAddr = Clones.clone(delegatorPoolImpl);
            delegatorPools[_params.l1Addr] = poolAddr;

            // TODO: Subtract already claimed delegated stake
            bondFor(_params.delegatedStake, poolAddr, _params.delegate);

            emit DelegatorPoolCreated(_params.l1Addr, poolAddr);
        }

        emit MigrateDelegatorFinalized(_params);
    }

    function finalizeMigrateUnbondingLocks(
        MigrateUnbondingLocksParams memory _params
    ) external onlyL1Counterpart(l1Migrator) {
        // TODO: Fill logic
        emit MigrateUnbondingLocksFinalized(_params);
    }

    function finalizeMigrateSender(MigrateSenderParams memory _params)
        external
        onlyL1Counterpart(l1Migrator)
    {
        // TODO: Fill logic
        emit MigrateSenderFinalized(_params);
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
