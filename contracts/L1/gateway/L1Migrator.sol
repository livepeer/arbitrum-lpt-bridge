// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {L1ArbitrumMessenger} from "./L1ArbitrumMessenger.sol";
import {IMigrator} from "../../interfaces/IMigrator.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";

interface IBondingManager {
    function isRegisteredTranscoder(address _addr) external view returns (bool);
    function pendingStake(address _addr, uint256 _endRound) external view returns (uint256);
    function pendingFees(address _addr, uint256 _endRound) external view returns (uint256);
    function getDelegator(address _addr) external view returns (
        uint256 bondedAmount,
        uint256 fees,
        address delegateAddress,
        uint256 delegatedAmount,
        uint256 startRound,
        uint256 lastClaimRound,
        uint256 nextUnbondingLockId
    );
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
        returns (
            Sender memory sender,
            ReserveInfo memory reserve
        );
}

interface IL2Migrator is IMigrator {
    function finalizeMigrateDelegator(MigrateDelegatorParams memory _params) external;
    function finalizeMigrateSender(MigrateSenderParams memory _params) external;
}

contract L1Migrator is L1ArbitrumMessenger, IMigrator, EIP712 {
    address public immutable bondingManagerAddr;
    address public immutable ticketBrokerAddr;
    address public immutable l2MigratorAddr;

    event MigrateDelegatorInitiated(
        uint256 indexed seqNo,
        MigrateDelegatorParams params
    );

    event MigrateSenderInitiated(
        uint256 indexed seqNo,
        MigrateSenderParams params
    );

    bytes32 private constant MIGRATE_DELEGATOR_TYPE_HASH = 
        keccak256("MigrateDelegator(address l1Addr,address l2Addr)");

    bytes32 private constant MIGRATE_SENDER_TYPE_HASH = 
        keccak256("MigrateSender(address l1Addr,address l2Addr)");

    constructor(
        address _inbox,
        address _bondingManagerAddr,
        address _ticketBrokerAddr,
        address _l2MigratorAddr
    ) L1ArbitrumMessenger(_inbox) EIP712("Livepeer L1Migrator", "1") {
        bondingManagerAddr = _bondingManagerAddr;
        ticketBrokerAddr = _ticketBrokerAddr;
        l2MigratorAddr = _l2MigratorAddr;
    }

    function migrateDelegator(
        address _l1Addr,
        address _l2Addr,
        bytes memory _sig,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        uint256 _maxSubmissionCost
    )
        external
    {
        requireValidMigration(
            MIGRATE_DELEGATOR_TYPE_HASH,
            _l1Addr,
            _l2Addr,
            _sig
        );

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
        MigrateDelegatorParams memory params = MigrateDelegatorParams({
            l1Addr: _l1Addr,
            l2Addr: _l2Addr,
            stake: stake,
            delegatedStake: delegatedAmount,
            fees: fees,
            delegate: delegateAddress
        });
        bytes memory data = abi.encodeWithSelector(
            IL2Migrator.finalizeMigrateDelegator.selector,
            params
        );
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

    function migrateSender(
        address _l1Addr,
        address _l2Addr,
        bytes memory _sig,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        uint256 _maxSubmissionCost
    )
        external
    {
        requireValidMigration(
            MIGRATE_SENDER_TYPE_HASH,
            _l1Addr,
            _l2Addr,
            _sig
        );

        ITicketBroker ticketBroker = ITicketBroker(ticketBrokerAddr);

        (
            ITicketBroker.Sender memory sender,
            ITicketBroker.ReserveInfo memory reserveInfo
        ) = ticketBroker.getSenderInfo(_l1Addr);

        // We do not prevent migration replays here to minimize L1 gas costs
        // The L2Migrator is responsible for rejecting migration replays

        // Call finalizeMigrateSender() on L2Migrator
        MigrateSenderParams memory params = MigrateSenderParams({
            l1Addr: _l1Addr,
            l2Addr: _l2Addr,
            deposit: sender.deposit,
            reserve: reserveInfo.fundsRemaining
        });
        bytes memory data = abi.encodeWithSelector(
            IL2Migrator.finalizeMigrateSender.selector,
            params
        );
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

    function requireValidMigration(
        bytes32 _typeHash,
        address _l1Addr,
        address _l2Addr,
        bytes memory _sig
    )
        internal
        view
    {
        require(
            _l2Addr != address(0),
            "L1Migrator#requireValidMigration: INVALID_L2_ADDR"
        );
        require(
            msg.sender == _l1Addr || recoverSigner(_typeHash, _l1Addr, _l2Addr, _sig) == _l1Addr,
            "L1Migrator#requireValidMigration: FAIL_AUTH"
        );
    }

    function recoverSigner(
        bytes32 _typeHash,
        address _l1Addr,
        address _l2Addr,
        bytes memory _sig
    )
        internal
        view
        returns (address)
    {
        if (_sig.length == 0) {
            return address(0);
        }

        bytes32 structHash = keccak256(abi.encode(_typeHash, _l1Addr, _l2Addr));
        bytes32 hash = _hashTypedDataV4(structHash);
        return ECDSA.recover(hash, _sig);
    }
}