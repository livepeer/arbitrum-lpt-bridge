pragma solidity 0.8.9;

import "ds-test/test.sol";
import "../../contracts/L2/gateway/L2Migrator.sol";

interface CheatCodes {
    function roll(uint256) external;

    function prank(address) external;

    function deal(address who, uint256 newBalance) external;

    function startPrank(address) external;

    function stopPrank() external;
}

interface IBondingManagerOverride {
    function bondForWithHint(
        uint256 _amount,
        address _owner,
        address _to,
        address _oldDelegateNewPosPrev,
        address _oldDelegateNewPosNext,
        address _newDelegateNewPosPrev,
        address _newDelegateNewPosNext
    ) external;

    function getDelegator(address _addr)
        external
        view
        returns (
            uint256 bondedAmount,
            uint256 fees,
            address delegateAddress,
            uint256 delegatedAmount,
            uint256 startRound,
            uint256 lastClaimRound,
            uint256 nextUnbondingLockId
        );

    function getDelegatorUnbondingLock(address _addr, uint256 _unbondingLockId)
        external
        view
        returns (uint256 amount, uint256 withdrawRound);
}

// forge test -v --fork-url https://alchemy_ARBITRUM_MAINNET_rpc_address
contract UnbondingLockTest is L2ArbitrumMessenger, DSTest {
    CheatCodes public constant CHEATS = CheatCodes(HEVM_ADDRESS);

    address public constant L1_MIGRATOR_ADDRESS =
        0x21146B872D3A95d2cF9afeD03eE5a783DaE9A89A;
    L2Migrator public constant L2_MIGRATOR =
        L2Migrator(payable(0x148D5b6B4df9530c7C76A810bd1Cdf69EC4c2085));
    IBondingManagerOverride public constant BONDING_MANAGER =
        IBondingManagerOverride(0x35Bcf3c30594191d53231E4FF333E8A770453e40);

    address public constant L1_DELEGATE =
        0xa20416801aC2eACf2372e825B4a90ef52490c2Bb;
    address public constant DELEGATOR_WITH_NON_NULL_DELEGATE =
        0x0070EdA17A3656D6568eC4C94FeF34A396D20613;
    address public constant DELEGATOR_WITH_NULL_DELEGATE =
        0x00ac9C5193660b1F69092Fb4B0f011521B67627f;

    uint256 public constant TEST_BLOCK_NUMBER = 14366402;

    function testSanityCheck() public {
        assertTrue(true);
    }

    function testFinalizeMigrateUnbondingLocksDelegatorWithNullDelegate()
        public
    {
        CHEATS.roll(TEST_BLOCK_NUMBER);
        CHEATS.startPrank(applyL1ToL2Alias(L1_MIGRATOR_ADDRESS));
        address delegateAddress = _migrateBondingLock(
            DELEGATOR_WITH_NULL_DELEGATE,
            address(0)
        );
        CHEATS.stopPrank();
        assertTrue(delegateAddress == address(0));
    }

    function testDelegateTransferWithDelegatorWithNullDelegate() public {
        CHEATS.roll(TEST_BLOCK_NUMBER);
        CHEATS.startPrank(applyL1ToL2Alias(L1_MIGRATOR_ADDRESS));
        address l2DelegateAlias = applyL1ToL2Alias(L1_DELEGATE);
        address delegateAddress = _migrateBondingLock(
            DELEGATOR_WITH_NULL_DELEGATE,
            l2DelegateAlias
        );
        CHEATS.stopPrank();
        assertTrue(delegateAddress == l2DelegateAlias);
    }

    function testDelegateTransferWithDelegatorWithNonNullDelegate() public {
        CHEATS.roll(TEST_BLOCK_NUMBER);
        CHEATS.startPrank(applyL1ToL2Alias(L1_MIGRATOR_ADDRESS));
        address l2DelegateAlias = applyL1ToL2Alias(L1_DELEGATE);
        address delegateAddress = _migrateBondingLock(
            DELEGATOR_WITH_NON_NULL_DELEGATE,
            l2DelegateAlias
        );
        CHEATS.stopPrank();
        assertTrue(delegateAddress == l2DelegateAlias);
    }

    function _migrateBondingLock(address _delegator, address _delegate)
        private
        returns (address)
    {
        uint256[] memory _unbondingLockIds = new uint256[](0);
        IMigrator.MigrateUnbondingLocksParams
            memory migrateDelegatorParams = IMigrator
                .MigrateUnbondingLocksParams({
                    l1Addr: _delegator,
                    l2Addr: applyL1ToL2Alias(_delegator),
                    total: 10,
                    unbondingLockIds: _unbondingLockIds,
                    delegate: _delegate
                });
        L2_MIGRATOR.finalizeMigrateUnbondingLocks(migrateDelegatorParams);

        return _fetchDelegateAddress(_delegator);
    }

    function _fetchDelegateAddress(address _delegator)
        private
        view
        returns (address)
    {
        (, , address delegateAddress, , , , ) = BONDING_MANAGER.getDelegator(
            applyL1ToL2Alias(_delegator)
        );
        return delegateAddress;
    }
}
