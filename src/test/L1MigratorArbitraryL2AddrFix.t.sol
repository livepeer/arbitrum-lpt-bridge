// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import "./L1MigratorArbitraryL2AddrPoC.t.sol";
import {L1Migrator} from "../../contracts/L1/gateway/L1Migrator.sol";

// Regression test for L1MigratorArbitraryL2AddrPoC: reruns the same attack and
// asserts the _l2Addr equality check now blocks it.
//
// Note it deploys L1Migrator from THIS REPO'S SOURCE at a fresh address and
// re-points L2Migrator at it, rather than exercising the live deployment. So it
// proves the source is fixed, not that any particular deployed address is. The
// forks are pinned so the pre-fix state it builds on cannot drift.
//
// ETH_RPC_URL="" ARB_RPC_URL="" ETH_BLOCK=24993518 ARB_BLOCK=457950814 forge test -vvv --match-contract L1MigratorArbitraryL2AddrFix
contract L1MigratorArbitraryL2AddrFix is L1MigratorArbitraryL2AddrPoC {

    // real L1 address confirmed to have non-zero unbonding locks on mainnet
    address internal constant L1_USER_WITH_LOCKS = 0xfB36cf75F1Cd3fDfAC7809D2152bA6475E57a207;

    address internal fixedL1MigratorAddr;

    function _createForks() internal override {
        l1Fork = CHEATS.createFork(CHEATS.envString("ETH_RPC_URL"), CHEATS.envUint("ETH_BLOCK"));
        l2Fork = CHEATS.createFork(CHEATS.envString("ARB_RPC_URL"), CHEATS.envUint("ARB_BLOCK"));
    }

    function setUp() public override {
        super.setUp();

        CHEATS.selectFork(l1Fork);
        CHEATS.deal(ATTACKER_RANDOM, 2 ether);

        // Deploy the fixed L1Migrator at a new address, fetching constructor args from the existing contract
        IL1Migrator existingL1Migrator = IL1Migrator(L1_MIGRATOR_ADDRESS);
        L1Migrator impl = new L1Migrator(
            existingL1Migrator.inbox(),
            existingL1Migrator.bondingManagerAddr(),
            existingL1Migrator.ticketBrokerAddr(),
            existingL1Migrator.tokenAddr(),
            existingL1Migrator.l1LPTGatewayAddr(),
            existingL1Migrator.l2MigratorAddr()
        );
        fixedL1MigratorAddr = address(impl);
        // constructor grants DEFAULT_ADMIN_ROLE to msg.sender (this test contract)
        IL1Migrator(fixedL1MigratorAddr).unpause();

        // set the new L1Migrator address for the L2Migrator
        CHEATS.selectFork(l2Fork);
        address controllerOwner = IController(L2_MIGRATOR.controller()).owner();
        CHEATS.prank(controllerOwner);
        L2_MIGRATOR.setL1Migrator(fixedL1MigratorAddr);
    }

    function test_treasuryDraining() public override {
        CHEATS.selectFork(l1Fork);

        CHEATS.prank(ATTACKER_FROM_L1POOL);
        CHEATS.expectRevert("L2_ADDR_MISMATCH");
        IL1Migrator(fixedL1MigratorAddr).migrateUnbondingLocks{value: 1 ether}(
            ATTACKER_FROM_L1POOL, whales[0], _ids(0), new bytes(0), 500_000, 1_000_000_000, 0.1 ether
        );
    }

    function test_griefing_via_emptyUnbondingLocks() public override {
        CHEATS.selectFork(l1Fork);
        uint256[] memory emptyLocks = new uint256[](0);

        CHEATS.prank(ATTACKER_RANDOM);
        CHEATS.expectRevert("L2_ADDR_MISMATCH");
        IL1Migrator(fixedL1MigratorAddr).migrateUnbondingLocks{value: 1 ether}(
            ATTACKER_RANDOM, whales[0], emptyLocks, new bytes(0), 500_000, 1_000_000_000, 0.1 ether
        );

        CHEATS.prank(ATTACKER_RANDOM);
        CHEATS.expectRevert("EMPTY_LOCK_IDS");
        IL1Migrator(fixedL1MigratorAddr).migrateUnbondingLocks{value: 1 ether}(
            ATTACKER_RANDOM, ATTACKER_RANDOM, emptyLocks, new bytes(0), 500_000, 1_000_000_000, 0.1 ether
        );
    }

    function test_griefing_via_fakeUnbondingLocks() public override {
        CHEATS.selectFork(l1Fork);

        CHEATS.prank(ATTACKER_RANDOM);
        CHEATS.expectRevert("L2_ADDR_MISMATCH");
        IL1Migrator(fixedL1MigratorAddr).migrateUnbondingLocks{value: 1 ether}(
            ATTACKER_RANDOM, whales[0], _ids(999), new bytes(0), 500_000, 1_000_000_000, 0.1 ether
        );

        CHEATS.prank(ATTACKER_RANDOM);
        CHEATS.expectRevert("ZERO_LOCK_AMOUNT");
        IL1Migrator(fixedL1MigratorAddr).migrateUnbondingLocks{value: 1 ether}(
            ATTACKER_RANDOM, ATTACKER_RANDOM, _ids(999), new bytes(0), 500_000, 1_000_000_000, 0.1 ether
        );
    }

    function test_griefing_via_migrateDelegator() public override {
        CHEATS.selectFork(l1Fork);

        CHEATS.prank(ATTACKER_RANDOM);
        CHEATS.expectRevert("L2_ADDR_MISMATCH");
        IL1Migrator(fixedL1MigratorAddr).migrateDelegator{value: 1 ether}(
            ATTACKER_RANDOM, whales[0], new bytes(0), 500_000, 1_000_000_000, 0.1 ether
        );
    }

    function test_normal_migrateUnbondingLocks_succeeds() public {
        // find the first real non-zero unbonding lock for the user with L1 locks
        CHEATS.selectFork(l1Fork);
        uint256 realLockId;
        uint256 realLockAmount;
        for (uint256 i = 0; i < 10; i++) {
            (uint256 amt,) = L1_BONDING.getDelegatorUnbondingLock(L1_USER_WITH_LOCKS, i);
            if (amt > 0) {
                realLockId = i;
                realLockAmount = amt;
                break;
            }
        }
        require(realLockAmount > 0, "No real unbonding lock found for L1_USER_WITH_LOCKS");

        uint256[] memory lockIds = _ids(realLockId);
        CHEATS.deal(L1_USER_WITH_LOCKS, 1 ether);
        CHEATS.prank(L1_USER_WITH_LOCKS);
        IL1Migrator(fixedL1MigratorAddr).migrateUnbondingLocks{value: 1 ether}(
            L1_USER_WITH_LOCKS, L1_USER_WITH_LOCKS, lockIds, new bytes(0), 500_000, 1_000_000_000, 0.1 ether
        );
        (, MigrateUnbondingLocksParams memory params) = IL1Migrator(fixedL1MigratorAddr)
            .getMigrateUnbondingLocksParams(L1_USER_WITH_LOCKS, L1_USER_WITH_LOCKS, lockIds);
        emit log_named_uint("Lock amount queued for migration on L1", params.total);

        CHEATS.selectFork(l2Fork);
        _skipToNextRound();
        L2_ROUNDS_MANAGER.initializeRound();

        // fund L2Migrator with bridged tokens
        CHEATS.prank(LIVEPEER_MINTER);
        L2_TOKEN.mint(address(L2_MIGRATOR), params.total);

        (uint256 bondedBefore,,,,,,) = L2_BONDING.getDelegator(L1_USER_WITH_LOCKS);

        CHEATS.startPrank(applyL1ToL2Alias(fixedL1MigratorAddr));
        L2_MIGRATOR.finalizeMigrateUnbondingLocks(params);
        CHEATS.stopPrank();

        (uint256 bondedAfter,, address delegateAfter,,,,) = L2_BONDING.getDelegator(L1_USER_WITH_LOCKS);

        assertEq(bondedAfter, bondedBefore + params.total, "Bonded amount must increase by migrated lock amount");
        assertEq(delegateAfter, params.delegate, "Delegate must match the L1 delegate packed into migration params");

        emit log_named_uint("Bonded amount before migration", bondedBefore);
        emit log_named_uint("Bonded amount after migration", bondedAfter);
        emit log_named_address("Delegate after migration", delegateAfter);
    }
}
