pragma solidity 0.8.9;

import "ds-test/test.sol";
import "../../contracts/L2/gateway/L2Migrator.sol";
import "./interfaces/ICheatCodes.sol";
import "./interfaces/IRoundManager.sol";
import "./interfaces/IBondingManager.sol";

// forge test -v --fork-url https://alchemy_ARBITRUM_MAINNET_rpc_address --match-contract UnbondingLockTest
contract UnbondingLockTest is L2ArbitrumMessenger, DSTest {
    ICheatCodes public constant CHEATS = ICheatCodes(HEVM_ADDRESS);

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
    IRoundsManager public constant ROUND_MANAGER =
        IRoundsManager(0xdd6f56DcC28D3F5f27084381fE8Df634985cc39f);

    uint256 public constant TEST_BLOCK_NUMBER = 9999999999;

    function testFinalizeMigrateUnbondingLocksDelegatorWithNullDelegate()
        public
    {
        CHEATS.roll(TEST_BLOCK_NUMBER);
        ROUND_MANAGER.initializeRound();
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
        ROUND_MANAGER.initializeRound();
        CHEATS.startPrank(applyL1ToL2Alias(L1_MIGRATOR_ADDRESS));
        address delegateAddress = _migrateBondingLock(
            DELEGATOR_WITH_NULL_DELEGATE,
            L1_DELEGATE
        );
        CHEATS.stopPrank();
        assertTrue(delegateAddress == L1_DELEGATE);
    }

    function testDelegateTransferWithDelegatorWithNonNullDelegate() public {
        CHEATS.roll(TEST_BLOCK_NUMBER);
        ROUND_MANAGER.initializeRound();
        CHEATS.startPrank(applyL1ToL2Alias(L1_MIGRATOR_ADDRESS));
        address delegateAddress = _migrateBondingLock(
            DELEGATOR_WITH_NON_NULL_DELEGATE,
            L1_DELEGATE
        );
        CHEATS.stopPrank();
        assertTrue(delegateAddress == L1_DELEGATE);
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
                    l2Addr: _delegator,
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
            _delegator
        );
        return delegateAddress;
    }
}
