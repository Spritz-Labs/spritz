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
forge install foundry-rs/forge-std@v1.9.4
forge build
```

## Configure env

```bash
cp .env.example .env
# Edit .env: RPC, SPRITZ_ENS_GATEWAY_URL, and signer (see below)
```

`SPRITZ_ENS_GATEWAY_URL` **must** include the literals `{sender}` and `{data}` (ENS substitutes them). Example:

`https://app.spritz.chat/api/ens/ccip-gateway?sender={sender}&data={data}`

### Where is the deployment private key configured?

**Not in `foundry.toml`** — that file only references the RPC URL. Foundry signs broadcasts using:

| Method | Where |
|--------|--------|
| **Hot wallet** | Environment variable **`ETH_PRIVATE_KEY`** (or **`PRIVATE_KEY`**) — usually in **`contracts/.env`** (create from `.env.example`). You must **export** it in the shell before `forge script`, e.g. `cd contracts && set -a && source .env && set +a && forge script ... --broadcast` |
| **CLI once** | `ETH_PRIVATE_KEY=0xabc... forge script ... --broadcast` (nothing stored in a file) |
| **Flag** | `--private-key 0x...` on `forge script` (same secret, different surface) |
| **Ledger / keystore** | No private key in env — use **`--ledger`** or **`cast wallet import`** then **`--account <name>`** ([Foundry wallets](https://book.getfoundry.sh/reference/cli/cast/wallet)) |

The deployer address becomes **`owner`** on `SpritzENSResolver` (can call `setGatewayUrls`).

**Security:** Never commit `contracts/.env`. Your repo `.gitignore` already ignores `.env` files.

## Deploy to mainnet

Set `MAINNET_RPC_URL` to dRPC (see `.env.example`) or use the built-in alias:

```bash
cd contracts
set -a && source .env && set +a
forge script script/DeploySpritzENSResolver.s.sol:DeploySpritzENSResolver \
  --rpc-url drpc \
  --broadcast \
  --private-key "$ETH_PRIVATE_KEY" \
  -vvvv
```

(`drpc` is defined in `foundry.toml`. **Use `--private-key`** — on many Foundry versions `ETH_PRIVATE_KEY` alone is not enough and you get “default sender” / “no associated wallet”. Quote `SPRITZ_ENS_GATEWAY_URL` in `.env` so `&` does not break `source`.)

**Option A — private key in `contracts/.env`**

```bash
cd contracts
set -a && source .env && set +a
forge script script/DeploySpritzENSResolver.s.sol:DeploySpritzENSResolver \
  --rpc-url "$MAINNET_RPC_URL" \
  --broadcast \
  --private-key "$ETH_PRIVATE_KEY" \
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
