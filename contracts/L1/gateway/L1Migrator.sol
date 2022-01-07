// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {L1ArbitrumMessenger} from "./L1ArbitrumMessenger.sol";
import {IL1LPTGateway} from "./IL1LPTGateway.sol";
import {IMigrator} from "../../interfaces/IMigrator.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";

interface IBondingManager {
    function isRegisteredTranscoder(address _addr) external view returns (bool);

    function pendingStake(address _addr, uint256 _endRound)
        external
        view
        returns (uint256);

    function pendingFees(address _addr, uint256 _endRound)
        external
        view
        returns (uint256);

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

interface ITicketBroker {
    struct Sender {
        uint256 deposit;
        uint256 withdrawRound;
    }

    struct ReserveInfo {
        uint256 fundsRemaining;
        uint256 claimedInCurrentRound;
    }

    function getSenderInfo(address _addr)
        external
        view
        returns (Sender memory sender, ReserveInfo memory reserve);
}

interface IBridgeMinter {
    function withdrawETHToL1Migrator() external returns (uint256);

    function withdrawLPTToL1Migrator() external returns (uint256);
}

interface ApproveLike {
    function approve(address _addr, uint256 _amount) external;
}

interface IL2Migrator is IMigrator {
    function finalizeMigrateDelegator(MigrateDelegatorParams memory _params)
        external;

    function finalizeMigrateUnbondingLocks(
        MigrateUnbondingLocksParams memory _params
    ) external;

    function finalizeMigrateSender(MigrateSenderParams memory _params) external;
}

contract L1Migrator is L1ArbitrumMessenger, IMigrator, EIP712 {
    address public immutable bondingManagerAddr;
    address public immutable ticketBrokerAddr;
    address public immutable bridgeMinterAddr;
    address public immutable tokenAddr;
    address public immutable l1LPTGatewayAddr;
    address public immutable l2MigratorAddr;

    event MigrateDelegatorInitiated(
        uint256 indexed seqNo,
        MigrateDelegatorParams params
    );

    event MigrateUnbondingLocksInitiated(
        uint256 indexed seqNo,
        MigrateUnbondingLocksParams params
    );

    event MigrateSenderInitiated(
        uint256 indexed seqNo,
        MigrateSenderParams params
    );

    bytes32 private constant MIGRATE_DELEGATOR_TYPE_HASH =
        keccak256("MigrateDelegator(address l1Addr,address l2Addr)");

    bytes32 private constant MIGRATE_UNBONDING_LOCKS_TYPE_HASH =
        keccak256(
            "MigrateUnbondingLocks(address l1Addr,address l2Addr,uint256[] unbondingLockIds)"
        );

    bytes32 private constant MIGRATE_SENDER_TYPE_HASH =
        keccak256("MigrateSender(address l1Addr,address l2Addr)");

    constructor(
        address _inbox,
        address _bondingManagerAddr,
        address _ticketBrokerAddr,
        address _bridgeMinterAddr,
        address _tokenAddr,
        address _l1LPTGatewayAddr,
        address _l2MigratorAddr
    ) L1ArbitrumMessenger(_inbox) EIP712("Livepeer L1Migrator", "1") {
        bondingManagerAddr = _bondingManagerAddr;
        ticketBrokerAddr = _ticketBrokerAddr;
        bridgeMinterAddr = _bridgeMinterAddr;
        tokenAddr = _tokenAddr;
        l1LPTGatewayAddr = _l1LPTGatewayAddr;
        l2MigratorAddr = _l2MigratorAddr;
    }

    function migrateDelegator(
        address _l1Addr,
        address _l2Addr,
        bytes memory _sig,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        uint256 _maxSubmissionCost
    ) external payable {
        requireValidMigration(
            _l1Addr,
            _l2Addr,
            keccak256(
                abi.encode(MIGRATE_DELEGATOR_TYPE_HASH, _l1Addr, _l2Addr)
            ),
            _sig
        );

        (
            bytes memory data,
            MigrateDelegatorParams memory params
        ) = getMigrateDelegatorParams(_l1Addr, _l2Addr);

        uint256 seqNo = sendTxToL2(
            l2MigratorAddr,
            _l2Addr, // Refunds to the L2 address
            _maxSubmissionCost,
            _maxGas,
            _gasPriceBid,
            data
        );

        emit MigrateDelegatorInitiated(seqNo, params);
    }

    function migrateUnbondingLocks(
        address _l1Addr,
        address _l2Addr,
        uint256[] calldata _unbondingLockIds,
        bytes memory _sig,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        uint256 _maxSubmissionCost
    ) external payable {
        requireValidMigration(
            _l1Addr,
            _l2Addr,
            keccak256(
                abi.encode(
                    MIGRATE_UNBONDING_LOCKS_TYPE_HASH,
                    _l1Addr,
                    _l2Addr,
                    keccak256(abi.encodePacked(_unbondingLockIds))
                )
            ),
            _sig
        );

        (
            bytes memory data,
            MigrateUnbondingLocksParams memory params
        ) = getMigrateUnbondingLocksParams(_l1Addr, _l2Addr, _unbondingLockIds);

        uint256 seqNo = sendTxToL2(
            l2MigratorAddr,
            _l2Addr, // Refund to the L2 address
            _maxSubmissionCost,
            _maxGas,
            _gasPriceBid,
            data
        );

        emit MigrateUnbondingLocksInitiated(seqNo, params);
    }

    function migrateSender(
        address _l1Addr,
        address _l2Addr,
        bytes memory _sig,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        uint256 _maxSubmissionCost
    ) external payable {
        requireValidMigration(
            _l1Addr,
            _l2Addr,
            keccak256(abi.encode(MIGRATE_SENDER_TYPE_HASH, _l1Addr, _l2Addr)),
            _sig
        );

        (
            bytes memory data,
            MigrateSenderParams memory params
        ) = getMigrateSenderParams(_l1Addr, _l2Addr);

        uint256 seqNo = sendTxToL2(
            l2MigratorAddr,
            _l2Addr, // Refund to the L2 address
            _maxSubmissionCost,
            _maxGas,
            _gasPriceBid,
            data
        );

        emit MigrateSenderInitiated(seqNo, params);
    }

    // TODO: Add whenNotPaused modifier to prevent this function from being called until other contracts are ready
    function migrateETH(
        uint256 _maxGas,
        uint256 _gasPriceBid,
        uint256 _maxSubmissionCost
    ) external payable {
        uint256 amount = IBridgeMinter(bridgeMinterAddr)
            .withdrawETHToL1Migrator();

        // Any ETH refunded to the L2 alias of this contract can be used for
        // other cross-chain txs sent by this contract.
        // The retryable ticket created will not be cancellable since this contract
        // currently does not support cross-chain txs to call ArbRetryableTx.cancel().
        sendTxToL2(
            l2MigratorAddr,
            address(this), // L2 alias of this contract will receive refunds
            msg.value,
            amount,
            _maxSubmissionCost,
            _maxGas,
            _gasPriceBid,
            ""
        );
    }

    // TODO: Add whenNotPaused modifier to prevent this function from being called until other contracts are ready
    function migrateLPT(
        uint256 _maxGas,
        uint256 _gasPriceBid,
        uint256 _maxSubmissionCost
    ) external payable {
        uint256 amount = IBridgeMinter(bridgeMinterAddr)
            .withdrawLPTToL1Migrator();

        // Approve L1LPTGateway to pull tokens
        ApproveLike(tokenAddr).approve(l1LPTGatewayAddr, amount);
        // Trigger cross-chain transfer with L1LPTGateway which will pull and escrow tokens
        // Forward msg.value to outboundTransfer() to be used for cross-chain tx
        IL1LPTGateway(l1LPTGatewayAddr).outboundTransfer{value: msg.value}(
            tokenAddr,
            l2MigratorAddr,
            amount,
            _maxGas,
            _gasPriceBid,
            abi.encode(_maxSubmissionCost, "")
        );
    }

    function getMigrateDelegatorParams(address _l1Addr, address _l2Addr)
        public
        view
        returns (bytes memory data, MigrateDelegatorParams memory params)
    {
        IBondingManager bondingManager = IBondingManager(bondingManagerAddr);

        // pendingStake() ignores the _endRound arg
        uint256 stake = bondingManager.pendingStake(_l1Addr, 0);
        // pendingFees() ignores the _endRound arg
        uint256 fees = bondingManager.pendingFees(_l1Addr, 0);
        (
            ,
            ,
            address delegateAddress,
            uint256 delegatedAmount,
            ,
            ,

        ) = bondingManager.getDelegator(_l1Addr);

        // We do not prevent migration replays here to minimize L1 gas costs
        // The L2Migrator is responsible for rejecting migration replays

        // Call finalizeMigrateDelegator() on L2Migrator
        params = MigrateDelegatorParams({
            l1Addr: _l1Addr,
            l2Addr: _l2Addr,
            stake: stake,
            delegatedStake: delegatedAmount,
            fees: fees,
            delegate: delegateAddress
        });

        data = abi.encodeWithSelector(
            IL2Migrator.finalizeMigrateDelegator.selector,
            params
        );
    }

    function getMigrateSenderParams(address _l1Addr, address _l2Addr)
        public
        view
        returns (bytes memory data, MigrateSenderParams memory params)
    {
        ITicketBroker ticketBroker = ITicketBroker(ticketBrokerAddr);

        (
            ITicketBroker.Sender memory sender,
            ITicketBroker.ReserveInfo memory reserveInfo
        ) = ticketBroker.getSenderInfo(_l1Addr);

        // We do not prevent migration replays here to minimize L1 gas costs
        // The L2Migrator is responsible for rejecting migration replays

        // Call finalizeMigrateSender() on L2Migrator
        params = MigrateSenderParams({
            l1Addr: _l1Addr,
            l2Addr: _l2Addr,
            deposit: sender.deposit,
            reserve: reserveInfo.fundsRemaining
        });

        data = abi.encodeWithSelector(
            IL2Migrator.finalizeMigrateSender.selector,
            params
        );
    }

    function getMigrateUnbondingLocksParams(
        address _l1Addr,
        address _l2Addr,
        uint256[] memory _unbondingLockIds
    )
        public
        view
        returns (bytes memory data, MigrateUnbondingLocksParams memory params)
    {
        IBondingManager bondingManager = IBondingManager(bondingManagerAddr);

        uint256 total = 0;
        for (uint256 i = 0; i < _unbondingLockIds.length; i++) {
            (uint256 amount, ) = bondingManager.getDelegatorUnbondingLock(
                _l1Addr,
                _unbondingLockIds[i]
            );

            total += amount;
        }

        (, , address delegateAddress, , , , ) = bondingManager.getDelegator(
            _l1Addr
        );

        // We do not prevent migration replays here to minimize L1 gas costs
        // The L2Migrator is responsible for rejecting migration replays

        // Call finalizeMigrateUnbondingLocks() on L2Migrator
        params = MigrateUnbondingLocksParams({
            l1Addr: _l1Addr,
            l2Addr: _l2Addr,
            total: total,
            unbondingLockIds: _unbondingLockIds,
            delegate: delegateAddress
        });

        data = abi.encodeWithSelector(
            IL2Migrator.finalizeMigrateUnbondingLocks.selector,
            params
        );
    }

    function requireValidMigration(
        address _l1Addr,
        address _l2Addr,
        bytes32 _structHash,
        bytes memory _sig
    ) internal view {
        require(
            _l2Addr != address(0),
            "L1Migrator#requireValidMigration: INVALID_L2_ADDR"
        );
        require(
            msg.sender == _l1Addr ||
                recoverSigner(_structHash, _sig) == _l1Addr,
            "L1Migrator#requireValidMigration: FAIL_AUTH"
        );
    }

    function recoverSigner(bytes32 _structHash, bytes memory _sig)
        internal
        view
        returns (address)
    {
        if (_sig.length == 0) {
            return address(0);
        }

        bytes32 hash = _hashTypedDataV4(_structHash);
        return ECDSA.recover(hash, _sig);
    }
}
