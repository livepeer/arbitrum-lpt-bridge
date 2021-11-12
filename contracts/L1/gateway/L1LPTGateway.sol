//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ControlledGateway} from "../../ControlledGateway.sol";

contract L1LPTGateway is ControlledGateway {
    constructor(address _token) ControlledGateway(_token) {}
}
