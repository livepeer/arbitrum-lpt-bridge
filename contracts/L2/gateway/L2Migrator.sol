// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {L2ArbitrumMessenger} from "./L2ArbitrumMessenger.sol";
import {IMigrator} from "../../interfaces/IMigrator.sol";

contract L2Migrator is L2ArbitrumMessenger, IMigrator {
    address public l1Migrator;

    event MigrateDelegatorFinalized(MigrateDelegatorParams params);

    event MigrateUnbondingLocksFinalized(MigrateUnbondingLocksParams params);

    event MigrateSenderFinalized(MigrateSenderParams params);

    constructor(address _l1Migrator) {
        l1Migrator = _l1Migrator;
    }

    // TODO: Add auth
    function setL1Migrator(address _l1Migrator) external {
        l1Migrator = _l1Migrator;
    }

    function finalizeMigrateDelegator(MigrateDelegatorParams memory _params)
        external
        onlyL1Counterpart(l1Migrator)
    {
        // TODO: Fill logic
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
}
