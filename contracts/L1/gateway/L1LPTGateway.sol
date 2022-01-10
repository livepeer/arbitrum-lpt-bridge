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

    function balanceOf(address account) external view returns (uint256);
}

interface IMinter {
    function bridgeMint(address _to, uint256 _amount) external;
}

contract L1LPTGateway is IL1LPTGateway, ControlledGateway, L1ArbitrumMessenger {
    address public immutable l1Router;
    address public immutable l1LPTEscrow;
    address public l2Counterpart;
    address public minter;

    constructor(
        address _l1Router,
        address _l1LPTEscrow,
        address _l1Lpt,
        address _l2Lpt,
        address _inbox
    ) ControlledGateway(_l1Lpt, _l2Lpt) L1ArbitrumMessenger(_inbox) {
        l1Router = _l1Router;
        l1LPTEscrow = _l1LPTEscrow;
    }

    function setCounterpart(address _l2Counterpart)
        external
        onlyRole(GOVERNOR_ROLE)
    {
        l2Counterpart = _l2Counterpart;
    }

    function setMinter(address _minter) external onlyRole(GOVERNOR_ROLE) {
        minter = _minter;
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

    function finalizeInboundTransfer(
        address l1Token,
        address from,
        address to,
        uint256 amount,
        bytes calldata data
    ) external override onlyL2Counterpart(l2Counterpart) {
        require(l1Token == l1Lpt, "TOKEN_NOT_LPT");
        (uint256 exitNum, ) = abi.decode(data, (uint256, bytes));

        uint256 escrowBalance = TokenLike(l1Token).balanceOf(l1LPTEscrow);

        // mint additional tokens if requested amount exceeds escrowed amount
        if (amount <= escrowBalance) {
            TokenLike(l1Token).transferFrom(l1LPTEscrow, to, amount);
        } else {
            if (escrowBalance > 0) {
                TokenLike(l1Token).transferFrom(l1LPTEscrow, to, escrowBalance);
            }
            IMinter(minter).bridgeMint(to, amount - escrowBalance);
        }

        emit WithdrawalFinalized(l1Token, from, to, exitNum, amount);
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

    function counterpartGateway() external view override returns (address) {
        return l2Counterpart;
    }

    function calculateL2TokenAddress(address l1Token)
        external
        view
        override
        returns (address)
    {
        if (l1Token != l1Lpt) {
            return address(0);
        }

        return l2Lpt;
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
