//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ControlledGateway} from "../../ControlledGateway.sol";
import {L1ArbitrumMessenger} from "./L1ArbitrumMessenger.sol";

contract L1LPTGateway is ControlledGateway, L1ArbitrumMessenger {
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
}
