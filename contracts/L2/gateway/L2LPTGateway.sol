//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ControlledGateway} from "../../ControlledGateway.sol";
import {L2ArbitrumMessenger} from "./L2ArbitrumMessenger.sol";
import {IL2LPTGateway} from "./IL2LPTGateway.sol";

interface Mintable {
    function mint(address _to, uint256 _amount) external;

    function burn(uint256 _amount) external;
}

contract L2LPTGateway is IL2LPTGateway, ControlledGateway, L2ArbitrumMessenger {
    address public immutable l2Router;
    address public immutable l1Counterpart;

    constructor(
        address _l2Router,
        address _l1Counterpart,
        address _l1Lpt,
        address _l2Lpt
    ) ControlledGateway(_l1Lpt, _l2Lpt) {
        l2Router = _l2Router;
        l1Counterpart = _l1Counterpart;
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
}
