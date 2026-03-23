// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console2} from "forge-std/Script.sol";
import {SpritzENSResolver} from "../src/SpritzENSResolver.sol";

/**
 * @notice Deploy SpritzENSResolver on Ethereum mainnet (or any chain).
 *
 *   cd contracts
 *   export MAINNET_RPC_URL=https://eth.drpc.org/   # or https://lb.drpc.live/ethereum/YOUR_KEY
 *   export SPRITZ_ENS_GATEWAY_URL='https://app.spritz.chat/api/ens/ccip-gateway?sender={sender}&data={data}'
 *   forge script script/DeploySpritzENSResolver.s.sol:DeploySpritzENSResolver \
 *     --rpc-url $MAINNET_RPC_URL --broadcast -vvvv
 *
 * Or use a hardware wallet / ledger:
 *   forge script ... --account myledger --broadcast
 */
contract DeploySpritzENSResolver is Script {
    function run() external {
        string memory gatewayUrl = vm.envString("SPRITZ_ENS_GATEWAY_URL");

        string[] memory urls = new string[](1);
        urls[0] = gatewayUrl;

        vm.startBroadcast();
        SpritzENSResolver resolver = new SpritzENSResolver(urls);
        vm.stopBroadcast();

        console2.log("SpritzENSResolver:", address(resolver));
        console2.log("Owner (can setGatewayUrls):", resolver.owner());
        console2.log("Gateway[0]:", gatewayUrl);
    }
}
