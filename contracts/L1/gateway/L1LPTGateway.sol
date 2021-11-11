//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ControlledGateway} from "../../ControlledGateway.sol";
import {L1ArbitrumMessenger} from "./L1ArbitrumMessenger.sol";
import {IL1LPTGateway} from "./IL1LPTGateway.sol";
import {IL2LPTGateway} from "../../L2/gateway/IL2LPTGateway.sol";

interface TokenLike {
    function transferFrom(
        address _from,
        address _to,
        uint256 _value
    ) external returns (bool success);
}

contract L1LPTGateway is IL1LPTGateway, ControlledGateway, L1ArbitrumMessenger {
    address public immutable l1Router;
    address public immutable l2Counterpart;
    address public immutable l1LPTEscrow;

    constructor(
        address _l1Router,
        address _l2Counterpart,
        address _l1LPTEscrow,
        address _l1Lpt,
        address _l2Lpt,
        address _inbox
    ) ControlledGateway(_l1Lpt, _l2Lpt) L1ArbitrumMessenger(_inbox) {
        l1Router = _l1Router;
        l2Counterpart = _l2Counterpart;
        l1LPTEscrow = _l1LPTEscrow;
    }

    function outboundTransfer(
        address _l1Token,
        address _to,
        uint256 _amount,
        uint256 _maxGas,
        uint256 _gasPriceBid,
        bytes calldata _data
    ) external payable override whenNotPaused returns (bytes memory) {
        require(_l1Token == l1Lpt, "TOKEN_NOT_LPT");

        // nested scope to avoid stack too deep errors
        address from;
        uint256 seqNum;
        bytes memory extraData;
        {
            uint256 maxSubmissionCost;
            (from, maxSubmissionCost, extraData) = parseOutboundData(_data);
            require(extraData.length == 0, "CALL_HOOK_DATA_NOT_ALLOWED");

            // transfer tokens to escrow
            TokenLike(_l1Token).transferFrom(from, l1LPTEscrow, _amount);

            bytes memory outboundCalldata = getOutboundCalldata(
                _l1Token,
                from,
                _to,
                _amount,
                extraData
            );

            seqNum = sendTxToL2(
                l2Counterpart,
                from,
                maxSubmissionCost,
                _maxGas,
                _gasPriceBid,
                outboundCalldata
            );
        }

        emit DepositInitiated(_l1Token, from, _to, seqNum, _amount);

        return abi.encode(seqNum);
    }

    function parseOutboundData(bytes memory data)
        internal
        view
        returns (
            address from,
            uint256 maxSubmissionCost,
            bytes memory extraData
        )
    {
        if (msg.sender == l1Router) {
            // router encoded
            (from, extraData) = abi.decode(data, (address, bytes));
        } else {
            from = msg.sender;
            extraData = data;
        }
        // user encoded
        (maxSubmissionCost, extraData) = abi.decode(
            extraData,
            (uint256, bytes)
        );
    }

    function getOutboundCalldata(
        address l1Token,
        address from,
        address to,
        uint256 amount,
        bytes memory data
    ) public pure returns (bytes memory outboundCalldata) {
        bytes memory emptyBytes = "";

        outboundCalldata = abi.encodeWithSelector(
            IL2LPTGateway.finalizeInboundTransfer.selector,
            l1Token,
            from,
            to,
            amount,
            abi.encode(emptyBytes, data)
        );

        return outboundCalldata;
    }
}
