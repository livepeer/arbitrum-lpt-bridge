//SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface Burnable {
    function burnFrom(address _from, uint256 _amount) external;
}

contract MockSpender {
    function transferTokens(
        address _from,
        address _token,
        uint256 _amount
    ) external {
        IERC20(_token).transferFrom(_from, address(this), _amount);
    }

    function burnTokens(
        address _from,
        address _token,
        uint256 _amount
    ) external {
        Burnable(_token).burnFrom(_from, _amount);
    }
}
