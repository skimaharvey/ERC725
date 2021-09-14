// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

import "../ERC725/IERC725Y.sol";

contract Dummy2 {

    function CallSetData(address to ,bytes32[] calldata _keys, bytes[] calldata _values) public {
        IERC725Y(to).setData(_keys,_values);
    }

    function CallGetData(address to ,bytes32[] calldata _keys) public view returns(bytes[] memory){
        return IERC725Y(to).getData(_keys);
    }

}