//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ControlledGateway} from "../../ControlledGateway.sol";

contract L2LPTGateway is ControlledGateway {
    constructor(address _token) ControlledGateway(_token) {}
}
