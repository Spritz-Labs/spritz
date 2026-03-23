# Spritz ENS resolver (on-chain)

`SpritzENSResolver` is a [CCIP Read / EIP-3668](https://docs.ens.domains/resolvers/ccip-read) resolver. It does not store records on-chain; it tells wallets to call your Spritz HTTPS gateway.

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`)
- ETH on **Ethereum mainnet** for gas (ENS for `.eth` is on mainnet)
- Spritz admin: enable ENS + correct gateway URL on `/admin/ens`
- An Ethereum mainnet RPC — we recommend **[dRPC](https://drpc.org/docs/ethereum-api)**:
  - **Public:** `https://eth.drpc.org/`
  - **With API key** (dashboard): `https://lb.drpc.live/ethereum/YOUR_DRPC_API_KEY`

## One-time setup

```bash
cd contracts
forge install foundry-rs/forge-std --no-commit
forge build
```

## Configure env

```bash
cp .env.example .env
# Edit .env: MAINNET_RPC_URL, SPRITZ_ENS_GATEWAY_URL, and your key method (see below)
```

`SPRITZ_ENS_GATEWAY_URL` **must** include the literals `{sender}` and `{data}` (ENS substitutes them). Example:

`https://app.spritz.chat/api/ens/ccip-gateway?sender={sender}&data={data}`

## Deploy to mainnet

Set `MAINNET_RPC_URL` to dRPC (see `.env.example`) or use the built-in alias:

```bash
forge script script/DeploySpritzENSResolver.s.sol:DeploySpritzENSResolver \
  --rpc-url drpc \
  --broadcast \
  -vvvv
```

(Requires `drpc` in `foundry.toml` — defaults to `https://eth.drpc.org/`.)

**Option A — private key in env (hot wallet)**

```bash
source .env
export ETH_PRIVATE_KEY=0x...   # deployer; becomes contract owner
forge script script/DeploySpritzENSResolver.s.sol:DeploySpritzENSResolver \
  --rpc-url "$MAINNET_RPC_URL" \
  --broadcast \
  -vvvv
```

**Option B — Ledger / keystore**

```bash
source .env
forge script script/DeploySpritzENSResolver.s.sol:DeploySpritzENSResolver \
  --rpc-url "$MAINNET_RPC_URL" \
  --account YOUR_CAST_ACCOUNT \
  --broadcast \
  -vvvv
```

Copy the printed **SpritzENSResolver** address.

## After deploy

1. In [ENS Manager](https://app.ens.domains/spritz.eth), connect the wallet that controls **spritz.eth**.
2. Set **Resolver** to your new contract address.
3. In Spritz **Admin → ENS**, paste the resolver address (reference) and save.

## Update gateway URL later

Owner can call `setGatewayUrls(string[] memory _urls)` (e.g. via Etherscan “Write contract” or `cast send`).

## Remix (no Foundry)

1. Create a new file, paste `src/SpritzENSResolver.sol`.
2. Compile with **0.8.20+**.
3. Deploy on **Injected Provider — Mainnet**.
4. Constructor argument: **array of 1 string** — your gateway URL with `{sender}` and `{data}`.
