# Verdict Protocol v2 — Local Testing Guide

## Prerequisites

- Rust + Cargo (`rustup`)
- Solana CLI (`solana --version`)
- Anchor CLI (`anchor --version`) — used only for the TypeScript client, not for building
- Node.js + npm
- Dependencies installed: `npm install`

## Important Notes

### Why `anchor build` is not used

Due to an incompatibility between the current Rust version and `anchor-syn`, `anchor build` does not work.
The program is built directly with `cargo build-sbf`, and the IDL is maintained **manually**.

### The IDL has been manually patched

`target/idl/verdict.json` is the default devnet-ready IDL. It contains the following
manual changes that `anchor build` would not generate correctly:

1. `resolve_market` — `vault` account added to the accounts list (used by the program but omitted by anchor-syn)
2. `Market` struct — `initial_pool_size` field added (field exists in Rust code but was not generated in the IDL)

**Never run `anchor build` without backing up the IDL first** — it will overwrite these manual changes.

Before running local tests, restore the local IDL:
`cp target/idl/verdict.local.json target/idl/verdict.json`

The local IDL (`verdict.local.json`) additionally has `"writable": true` on the `admin` account
in `resolve_market` — required on local validator where admin pays the tx fee.


---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Verify the admin fixture keypair exists

```bash
ls tests/fixtures/admin.json
solana-keygen pubkey tests/fixtures/admin.json
# Expected: 4zLY3ctGsunFvBNPsFZKxDj7xRVwuG4Ni2U8kgEk7n99
```

---

## Running the Tests

### Step 1 — Build the program with the local-admin feature

```bash
cargo build-sbf -- --features local-admin
```

The `local-admin` feature sets `PROTOCOL_ADMIN` to the local admin address
(`4zLY3ctGsunFvBNPsFZKxDj7xRVwuG4Ni2U8kgEk7n99`) instead of the devnet address.

### Step 2 — Start the local validator (in a separate terminal)

```bash
solana-test-validator --reset
```

`--reset` is mandatory — it clears old on-chain state. Without it, tests will fail because PDAs already exist from a previous run.

### Step 3 — Airdrop SOL to the required wallets

```bash
solana airdrop 10 HESGaak1WvAXvepem8GQAjhrKDXtkfT6Eb8zZeLg9JTU --url localhost
solana airdrop 60 $(solana-keygen pubkey tests/fixtures/admin.json) --url localhost
```

- `HESGaak1WvAXvepem8GQAjhrKDXtkfT6Eb8zZeLg9JTU` — deploy authority (`~/deploy-devnet.json`), needs ~2 SOL for deploy
- `4zLY3ctGsunFvBNPsFZKxDj7xRVwuG4Ni2U8kgEk7n99` — local admin (`tests/fixtures/admin.json`), needs **60 SOL** minimum

> **Why 60 SOL for admin?** Test E3 buys 50 SOL worth of shares in a single transaction. The admin wallet
> also funds ~15 markets throughout the test suite (each costs `rent_exempt + 20,000,000 lamports`),
> plus transaction fees. 60 SOL provides comfortable headroom.

### Step 4 — Deploy the program to the local validator

```bash
solana program deploy target/deploy/verdict.so \
  --keypair ~/deploy-devnet.json \
  --url localhost
```

Expected output:
```
Program Id: C8s7AU4HCN6NNSU9XLWTaJECAqseX41AjTDyRpuJ9TFZ
```

### Step 5 — Run the tests

```bash
ANCHOR_PROVIDER_URL=http://localhost:8899 \
ANCHOR_WALLET=tests/fixtures/admin.json \
./node_modules/.bin/ts-mocha --timeout 120000 \
  tests/verdict.ts tests/invariants.ts
```

### Expected result

```
32 passing
```

---

## Test Suite Overview

### `tests/verdict.ts` — 27 tests

| Test | Description |
|------|-------------|
| 1–3 | `create_market` — success, empty question, past timestamp |
| 4–7 | `buy_shares` — YES/NO share calculation, price shift, expired market |
| 8–10 | `resolve_market` — admin success, before expiry, unauthorized |
| 11–13 | `claim_winnings` — YES winner, NO loser, double claim |
| 14 | Fee split — 2% total (1% treasury, 1% creator) |
| 15–18 | `withdraw_protocol_fees` — admin, non-admin, overflow, zero amount |
| 19 | Admin resolves a market created by another user |
| A–D | Accounting — fund conservation, proportional payouts, vault drains to zero |
| E1–E3 | Edge cases — boundary timestamp, 1 lamport buy, 50 SOL buy |
| F | Stress test — 12 randomized trades, full fund conservation check |

### `tests/invariants.ts` — 5 tests

| Test | Invariant |
|------|-----------|
| INV-1 | Buying shares on a resolved market must fail |
| INV-2 | Claiming winnings before resolution must fail |
| INV-3 | Resolving an already-resolved market must fail |
| INV-4 | Creator receives exact `initial_pool_size` refund on resolution |
| INV-5 | Claiming from market A vault does not affect market B vault |

---

## Wallet Reference

| Wallet | Address | Role |
|--------|---------|------|
| `tests/fixtures/admin.json` | `4zLY3ctGsunFvBNPsFZKxDj7xRVwuG4Ni2U8kgEk7n99` | Local `PROTOCOL_ADMIN`, `ANCHOR_WALLET`, tx fee payer |
| `~/deploy-devnet.json` | `HESGaak1WvAXvepem8GQAjhrKDXtkfT6Eb8zZeLg9JTU` | Deploy authority |

---

## Troubleshooting

### `account already in use`

The validator was not reset between runs. Run `solana-test-validator --reset` and repeat from Step 3.

### `insufficient funds`

Airdrop was not done or the amounts were too low. Repeat Step 3 with the amounts above.

### `AccountNotSigner` on `admin`

The IDL is incorrect — `admin` in `resolve_market` must have `"writable": true, "signer": true`. Verify:

```bash
python3 -c "
import json
idl = json.load(open('target/idl/verdict.json'))
for ix in idl['instructions']:
    if ix['name'] == 'resolve_market':
        for acc in ix['accounts']:
            if acc['name'] == 'admin':
                print(acc)
"
```

If `writable` is missing, add it:

```bash
python3 -c "
import json
idl = json.load(open('target/idl/verdict.json'))
for ix in idl['instructions']:
    if ix['name'] == 'resolve_market':
        for acc in ix['accounts']:
            if acc['name'] == 'admin':
                acc['writable'] = True
json.dump(idl, open('target/idl/verdict.json', 'w'), indent=2)
"
```

### `Cannot read properties of undefined (reading 'toNumber')` on `initialPoolSize`

`initial_pool_size` is missing from the IDL Market struct. Add it:

```bash
python3 -c "
import json
idl = json.load(open('target/idl/verdict.json'))
for t in idl['types']:
    if t['name'] == 'Market':
        fields = t['type']['fields']
        idx = next(i for i,f in enumerate(fields) if f['name'] == 'vault_bump')
        fields.insert(idx, {'name': 'initial_pool_size', 'type': 'u64'})
json.dump(idl, open('target/idl/verdict.json', 'w'), indent=2)
"
```

### `vault` missing from `resolve_market` IDL accounts

```bash
python3 -c "
import json
idl = json.load(open('target/idl/verdict.json'))
for ix in idl['instructions']:
    if ix['name'] == 'resolve_market':
        accounts = ix['accounts']
        names = [a['name'] for a in accounts]
        if 'vault' not in names:
            accounts.insert(1, {'name': 'vault', 'writable': True})
            print('vault added')
        else:
            print('vault already present')
json.dump(idl, open('target/idl/verdict.json', 'w'), indent=2)
"
```
