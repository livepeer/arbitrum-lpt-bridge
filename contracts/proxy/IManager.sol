// SPDX-License-Identifier: MIT
pragma solidity 0.8.8;

interface IManager {
    event SetController(address controller);

    function setController(address _controller) external;
}
