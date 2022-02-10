// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

interface IController {
    function owner() external view returns (address);

    function paused() external view returns (bool);

    function getContract(bytes32 _id) external view returns (address);
}
