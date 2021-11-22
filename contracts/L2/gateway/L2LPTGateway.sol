//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ControlledGateway} from "../../ControlledGateway.sol";
import {L2ArbitrumMessenger} from "./L2ArbitrumMessenger.sol";
import {IL2LPTGateway} from "./IL2LPTGateway.sol";
import {IL1LPTGateway} from "../../L1/gateway/IL1LPTGateway.sol";

interface Mintable {
    function mint(address _to, uint256 _amount) external;

    function gatewayBurn(address _from, uint256 _amount) external;
}

contract L2LPTGateway is IL2LPTGateway, ControlledGateway, L2ArbitrumMessenger {
    address public immutable l2Router;
    address public l1Counterpart;

    constructor(
        address _l2Router,
        address _l1Lpt,
        address _l2Lpt
    ) ControlledGateway(_l1Lpt, _l2Lpt) {
        l2Router = _l2Router;
    }

    function setCounterpart(address _l1Counterpart)
        external
        onlyRole(GOVERNOR_ROLE)
    {
        l1Counterpart = _l1Counterpart;
    }

    function outboundTransfer(
        address _l1Token,
        address _to,
        uint256 _amount,
        bytes calldata _data
    ) public override whenNotPaused returns (bytes memory res) {
        require(_l1Token == l1Lpt, "TOKEN_NOT_LPT");

        (address from, bytes memory extraData) = parseOutboundData(_data);
        require(extraData.length == 0, "CALL_HOOK_DATA_NOT_ALLOWED");

        Mintable(l2Lpt).gatewayBurn(from, _amount);

        uint256 id = sendTxToL1(
            from,
            l1Counterpart,
            getOutboundCalldata(_l1Token, from, _to, _amount, extraData)
        );

        // we don't need to track exitNums (b/c we have no fast exits) so we always use 0
        emit WithdrawalInitiated(_l1Token, from, _to, id, 0, _amount);

        return abi.encode(id);
    }

    function finalizeInboundTransfer(
        address _l1Token,
        address _from,
        address _to,
        uint256 _amount,
        bytes calldata // data -- unused
    ) external override onlyL1Counterpart(l1Counterpart) {
        require(_l1Token == l1Lpt, "TOKEN_NOT_LPT");

        Mintable(l2Lpt).mint(_to, _amount);

        emit DepositFinalized(_l1Token, _from, _to, _amount);
    }

    function parseOutboundData(bytes memory data)
        internal
        view
        returns (address from, bytes memory extraData)
    {
        if (msg.sender == l2Router) {
            (from, extraData) = abi.decode(data, (address, bytes));
        } else {
            from = msg.sender;
            extraData = data;
        }
    }

    function counterpartGateway() external view override returns (address) {
        return l1Counterpart;
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
        address token,
        address from,
        address to,
        uint256 amount,
        bytes memory data
    ) public pure returns (bytes memory outboundCalldata) {
        outboundCalldata = abi.encodeWithSelector(
            IL1LPTGateway.finalizeInboundTransfer.selector,
            token,
            from,
            to,
            amount,
            abi.encode(0, data) // we don't need to track exitNums (b/c we have no fast exits) so we always use 0
        );

        return outboundCalldata;
    }
}
