//SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ApproveLike {
    function approve(address, uint256) external;
}

contract L1LPTEscrow {
    mapping(address => bool) public allowed;

    event Allow(address indexed _user);

    event Deny(address indexed _user);

    event Approve(
        address indexed _token,
        address indexed _spender,
        uint256 _value
    );

    modifier auth() {
        require(allowed[msg.sender] == true, "NOT_AUTHORIZED");
        _;
    }

    constructor() {
        allowed[msg.sender] = true;
    }

    function allow(address _user) external auth {
        allowed[_user] = true;
        emit Allow(_user);
    }

    function deny(address _user) external auth {
        allowed[_user] = false;
        emit Deny(_user);
    }

    function approve(
        address _token,
        address _spender,
        uint256 _value
    ) external auth {
        emit Approve(_token, _spender, _value);
        ApproveLike(_token).approve(_spender, _value);
    }
}
