pragma solidity 0.8.9;

interface ICheatCodes {
    function roll(uint256) external;

    function prank(address) external;

    function deal(address who, uint256 newBalance) external;

    function startPrank(address) external;

    function stopPrank() external;
}

