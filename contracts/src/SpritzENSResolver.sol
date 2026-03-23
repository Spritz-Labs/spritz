// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SpritzENSResolver
 * @notice CCIP-Read (EIP-3668) resolver for *.spritz.eth subnames.
 *         All resolution is deferred to an offchain gateway that reads from
 *         the Spritz database. Deploy this on Ethereum mainnet and set it as
 *         the resolver for spritz.eth in the ENS Manager.
 *
 * Setup:
 *   1. Deploy with: gateway URL(s) and the admin/owner address
 *   2. In the ENS Manager, set spritz.eth's resolver to this contract
 *   3. The Spritz gateway at the configured URL handles all resolution
 */

interface IExtendedResolver {
    function resolve(bytes calldata name, bytes calldata data) external view returns (bytes memory);
}

contract SpritzENSResolver is IExtendedResolver {
    error OffchainLookup(
        address sender,
        string[] urls,
        bytes callData,
        bytes4 callbackFunction,
        bytes extraData
    );

    string[] public gatewayUrls;
    address public owner;

    event GatewayUrlsUpdated(string[] urls);
    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(string[] memory _gatewayUrls) {
        owner = msg.sender;
        gatewayUrls = _gatewayUrls;
    }

    /**
     * @notice Implements EIP-3668 CCIP Read. Always reverts with OffchainLookup
     *         to direct clients to the offchain gateway.
     */
    function resolve(bytes calldata name, bytes calldata data)
        external
        view
        override
        returns (bytes memory)
    {
        bytes memory callData = abi.encodeWithSelector(
            IExtendedResolver.resolve.selector,
            name,
            data
        );

        revert OffchainLookup(
            address(this),
            gatewayUrls,
            callData,
            this.resolveCallback.selector,
            callData // extraData for the callback
        );
    }

    /**
     * @notice Callback after the gateway returns data. For a trusted gateway
     *         model, we simply pass through the response. For a trustless model,
     *         add signature verification here.
     */
    function resolveCallback(bytes calldata response, bytes calldata /* extraData */)
        external
        pure
        returns (bytes memory)
    {
        return response;
    }

    // --- Admin functions ---

    function setGatewayUrls(string[] memory _urls) external onlyOwner {
        gatewayUrls = _urls;
        emit GatewayUrlsUpdated(_urls);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @notice EIP-165 interface support for IExtendedResolver
     */
    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == type(IExtendedResolver).interfaceId || // 0x9061b923
            interfaceId == 0x01ffc9a7; // EIP-165
    }
}
