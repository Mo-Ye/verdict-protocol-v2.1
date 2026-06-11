# Verdict Protocol v2 — Devnet Deployment Guide

## Prerequisites

- Local tests pass 32/32 (see `TESTING.md`)
- Deploy authority keypair available at `~/deploy-devnet.json` (`HESGaak1WvAXvepem8GQAjhrKDXtkfT6Eb8zZeLg9JTU`)
- At least 2 SOL on devnet for the deploy authority

---

## Local vs Devnet Differences

| | Local | Devnet |
|---|-------|--------|
| `PROTOCOL_ADMIN` | `4zLY3ctGsunFvBNPsFZKxDj7xRVwuG4Ni2U8kgEk7n99` | `HxqWfGfbbQ4LCgZicrTdbzGMqffAARNfb4S1Rxvchxto` |
| Build flag | `--features local-admin` | *(no flag)* |
| IDL `admin.writable` | `true` | `false` (only `signer: true`) |

---

## Devnet Deploy Steps

### Step 1 — Check SOL balance on deploy authority

```bash
solana balance HESGaak1WvAXvepem8GQAjhrKDXtkfT6Eb8zZeLg9JTU --url devnet
```

If below 2 SOL:

```bash
solana airdrop 2 HESGaak1WvAXvepem8GQAjhrKDXtkfT6Eb8zZeLg9JTU --url devnet
```

### Step 2 — Build for devnet (without local-admin feature)

```bash
cargo build-sbf
```

This compiles the program with the production `PROTOCOL_ADMIN` (`HxqWfGfbbQ4LCgZicrTdbzGMqffAARNfb4S1Rxvchxto`).

### Step 3 — Deploy to devnet

```bash
solana program deploy target/deploy/verdict.so \
  --keypair ~/deploy-devnet.json \
  --url devnet
```

Expected output:
```
Program Id: C8s7AU4HCN6NNSU9XLWTaJECAqseX41AjTDyRpuJ9TFZ
```

### Step 4 — Prepare the devnet IDL

The IDL used by frontend clients on devnet must differ from the local testing IDL.
Specifically, `admin` in `resolve_market` must **not** have `"writable": true`
on devnet — the on-chain program does not require it there.

Create a devnet-specific IDL:

```bash
cp target/idl/verdict.json target/idl/verdict.devnet.json
python3 -c "
import json
idl = json.load(open('target/idl/verdict.devnet.json'))
for ix in idl['instructions']:
    if ix['name'] == 'resolve_market':
        for acc in ix['accounts']:
            if acc['name'] == 'admin':
                acc.pop('writable', None)
                print('Devnet IDL admin:', acc)
json.dump(idl, open('target/idl/verdict.devnet.json', 'w'), indent=2)
"
```

Frontend and devnet clients should load `target/idl/verdict.devnet.json`.

---

## IDL File Reference

| File | Purpose |
|------|---------|
| `target/idl/verdict.json` | Local testing (admin writable=true) |
| `target/idl/verdict.json.bak` | Backup of the original IDL |
| `target/idl/verdict.devnet.json` | Devnet client (admin writable=false) |

---

## Verifying the Devnet Deploy

After deploying, confirm the program exists on-chain:

```bash
solana program show C8s7AU4HCN6NNSU9XLWTaJECAqseX41AjTDyRpuJ9TFZ --url devnet
```

Manually test `resolve_market` with the `PROTOCOL_ADMIN` wallet
(`HxqWfGfbbQ4LCgZicrTdbzGMqffAARNfb4S1Rxvchxto`) on an existing devnet market.

---

## Returning to Local Testing After a Devnet Deploy

The program must be rebuilt with the `local-admin` feature:

```bash
cargo build-sbf -- --features local-admin
```

The local IDL (`target/idl/verdict.json`, not `verdict.devnet.json`) must be in place.

Always run `solana-test-validator --reset` before local tests.

---

## Note on the `initial_pool_size` Field

This field was added to the `Market` struct after the last successful `anchor build`.
It was manually added to the IDL and must remain consistent with the Rust definition
in `programs/verdict/src/state/market.rs`.

Field position in the IDL: between `winning_pot` and `vault_bump`.

If `anchor build` is ever run again (after resolving the Rust/anchor-syn incompatibility),
verify that the IDL contains this field and all other manual patches listed in `TESTING.md`.
