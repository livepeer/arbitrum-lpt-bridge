//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IL2LPTGateway {
    function finalizeInboundTransfer(
        address _token,
        address _from,
        address _to,
        uint256 _amount,
        bytes calldata _data
    ) external;
}
