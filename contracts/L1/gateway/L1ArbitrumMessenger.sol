//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IBridge} from "../../arbitrum/IBridge.sol";
import {IInbox} from "../../arbitrum/IInbox.sol";
import {IOutbox} from "../../arbitrum/IOutbox.sol";

abstract contract L1ArbitrumMessenger {
    IInbox public immutable inbox;

    event TxToL2(
        address indexed from,
        address indexed to,
        uint256 indexed seqNum,
        bytes data
    );

    constructor(address _inbox) {
        inbox = IInbox(_inbox);
    }

    modifier onlyL2Counterpart(address l2Counterpart) {
        // a message coming from the counterpart gateway was executed by the bridge
        address bridge = inbox.bridge();
        require(msg.sender == bridge, "NOT_FROM_BRIDGE");

        // and the outbox reports that the L2 address of the sender is the counterpart gateway
        address l2ToL1Sender = IOutbox(IBridge(bridge).activeOutbox())
            .l2ToL1Sender();
        require(l2ToL1Sender == l2Counterpart, "ONLY_COUNTERPART_GATEWAY");
        _;
    }

    function sendTxToL2(
        address target,
        address user,
        uint256 maxSubmissionCost,
        uint256 maxGas,
        uint256 gasPriceBid,
        bytes memory data
    ) internal returns (uint256) {
        uint256 seqNum = inbox.createRetryableTicket{value: msg.value}(
            target,
            0, // we always assume that l2CallValue = 0
            maxSubmissionCost,
            user,
            user,
            maxGas,
            gasPriceBid,
            data
        );
        emit TxToL2(user, target, seqNum, data);
        return seqNum;
    }
}
