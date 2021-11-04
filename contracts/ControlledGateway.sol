//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

contract ControlledGateway is AccessControl, Pausable {
    bytes32 public constant GOVERNANCE_CONTROLLER =
        keccak256("GOVERNANCE_CONTROLLER");

    address public token;

    constructor(address _token) {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setRoleAdmin(GOVERNANCE_CONTROLLER, DEFAULT_ADMIN_ROLE);

        token = _token;
    }

    function addGovernanceController(address _newController)
        external
        whenNotPaused
    {
        grantRole(GOVERNANCE_CONTROLLER, _newController);
    }

    function pause() external onlyRole(GOVERNANCE_CONTROLLER) {
        _pause();
    }

    function unpause() external onlyRole(GOVERNANCE_CONTROLLER) {
        _unpause();
    }
}
