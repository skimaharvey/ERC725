// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.0;

// modules
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import "./ERC725XCore.sol";

/**
 * @title Inheritable Proxy Implementation of ERC725 X Executor
 * @author Fabian Vogelsteller <fabian@lukso.network>
 * @dev Implementation of a contract module which provides the ability to call arbitrary functions at any other smart contract and itself,
 * including using `delegatecall`, `staticcall` as well creating contracts using `create` and `create2`
 * This is the basis for a smart contract based account system, but could also be used as a proxy account system
 */
abstract contract ERC725XInitAbstract is Initializable, ERC165, ERC725XCore {
    function _initialize(address _newOwner) internal virtual onlyInitializing {
        // This is necessary to prevent a contract that implements both ERC725X and ERC725Y to call both constructors
        if (_newOwner != owner()) {
            OwnableUnset.initOwner(_newOwner);
        }
    }

    /* Overrides functions */

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) public view virtual override returns (bool) {
        return interfaceId == _INTERFACEID_ERC725X || super.supportsInterface(interfaceId);
    }
}