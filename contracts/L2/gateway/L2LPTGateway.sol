//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ControlledGateway} from "../../ControlledGateway.sol";
import {L2ArbitrumMessenger} from "./L2ArbitrumMessenger.sol";

contract L2LPTGateway is ControlledGateway, L2ArbitrumMessenger {
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
}
