//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC20, ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ILivepeerToken} from "./ILivepeerToken.sol";

contract LivepeerToken is ILivepeerToken, ERC20Permit, Ownable {
    constructor()
        ERC20("Livepeer Token", "LPT")
        ERC20Permit("Livepeer Token")
    {}

    /**
     * @dev Function to mint tokens
     * @param _to The address that will receive the minted tokens.
     * @param _amount The amount of tokens to mint.
     * @return A boolean that indicates if the operation was successful.
     */
    function mint(address _to, uint256 _amount)
        public
        onlyOwner
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
    function burn(uint256 _amount) public {
        _burn(_msgSender(), _amount);
        emit Burn(_msgSender(), _amount);
    }
}
