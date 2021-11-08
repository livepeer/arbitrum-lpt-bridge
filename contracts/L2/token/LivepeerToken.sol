//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC20, ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import {ILivepeerToken} from "./ILivepeerToken.sol";

contract LivepeerToken is ILivepeerToken, AccessControl, ERC20Permit {
    bytes32 public constant MINT_CONTROLLER = keccak256("MINT_CONTROLLER");

    constructor() ERC20("Livepeer Token", "LPT") ERC20Permit("Livepeer Token") {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setRoleAdmin(MINT_CONTROLLER, DEFAULT_ADMIN_ROLE);
    }

    function addMintController(address _newController) external {
        grantRole(MINT_CONTROLLER, _newController);
    }

    /**
     * @dev Function to mint tokens
     * @param _to The address that will receive the minted tokens.
     * @param _amount The amount of tokens to mint.
     * @return A boolean that indicates if the operation was successful.
     */
    function mint(address _to, uint256 _amount)
        external
        override
        onlyRole(MINT_CONTROLLER)
        returns (bool)
    {
        _mint(_to, _amount);
        emit Mint(_to, _amount);
        return true;
    }

    /**
     * @dev Burns a specific amount of the sender's tokens
     * @param _amount The amount of tokens to be burned
     */
    function burn(uint256 _amount) external override {
        _burn(_msgSender(), _amount);
        emit Burn(_msgSender(), _amount);
    }
}
