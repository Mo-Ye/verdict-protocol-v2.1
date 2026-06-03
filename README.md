# Verdict Protocol

A simplified prediction market protocol built on Solana using the Anchor framework.

Users can create binary (YES/NO) prediction markets, buy shares using SOL through a constant product AMM, and claim winnings after resolution.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  Verdict Program                 │
├─────────────┬─────────────┬─────────┬───────────┤
│create_market│ buy_shares  │ resolve │  claim    │
│             │  (AMM)      │ _market │ _winnings │
├─────────────┴─────────────┴─────────┴───────────┤
│                                                  │
│  Market PDA        UserPosition PDA              │
│  ┌──────────────┐  ┌──────────────┐              │
│  │ question     │  │ user         │              │
│  │ yes_pool     │  │ yes_shares   │              │
│  │ no_pool      │  │ no_shares    │              │
│  │ resolved     │  │ claimed      │              │
│  │ outcome      │  └──────────────┘              │
│  │ creator      │                                │
│  └──────────────┘                                │
│                                                  │
│  Vault PDA (SOL)     Treasury PDA (fees)         │
└─────────────────────────────────────────────────┘
```

### PDAs (Program Derived Addresses)

| PDA | Seeds | Purpose |
|-----|-------|---------|
| Market | `["market", creator, sha256(question)]` | Stores market state and AMM pools |
| UserPosition | `["position", market, user]` | Tracks each user's share holdings |
| Vault | `["vault", market]` | Holds SOL deposits for the market |
| Treasury | `["treasury"]` | Collects protocol fees (1%) |

### Constant Product AMM

The protocol uses a constant product formula (`K = yes_pool * no_pool`) for pricing:

- Initial pools: `yes_pool = 1000, no_pool = 1000` (50/50 odds)
- When buying YES: `new_yes_pool = yes_pool + amount`, `new_no_pool = K / new_yes_pool`
- Shares out = `old_no_pool - new_no_pool`
- 2% fee: 1% to protocol treasury, 1% stays in vault as creator fee

### Fee Structure

| Fee | Rate | Destination |
|-----|------|-------------|
| Protocol fee | 1% | Treasury PDA |
| Creator fee | 1% | Vault (stays in market pool) |
| **Total** | **2%** | |

## Instructions

### `create_market(question: String, end_timestamp: i64)`
Creates a new prediction market with a binary question and expiry time.

### `buy_shares(amount_in: u64, is_yes: bool)`
Buys YES or NO shares using SOL via the constant product AMM.

### `resolve_market(outcome: bool, admin_key: Pubkey)`
Resolves a market after expiry. Only callable by admin.

### `claim_winnings()`
Claims proportional winnings from the vault after market resolution.

## Setup

### Prerequisites

- [Rust](https://rustup.rs/) (1.79+)
- [Solana CLI](https://docs.solanalabs.com/cli/install) (v2.1+)
- [Anchor](https://www.anchor-lang.com/docs/installation) (v0.30.1)
- [Node.js](https://nodejs.org/) (v18+)

### Install Dependencies

```bash
yarn install
```

### Build

```bash
cargo build-sbf --manifest-path=programs/verdict/Cargo.toml
```

### Test

```bash
# Start local validator with the program
solana-test-validator --reset --bpf-program 6VmLghUCKtnihagf4gJ9dv5F7tnrEvuXPS5hpikiy9U8 target/deploy/verdict.so

# In another terminal
export ANCHOR_PROVIDER_URL=http://localhost:8899
export ANCHOR_WALLET=~/.config/solana/id.json
solana airdrop 10
yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
```

All 14 tests should pass:

```
  verdict
    ✔ 1. create_market — success
    ✔ 2. create_market — fails with empty question
    ✔ 3. create_market — fails with past timestamp
    ✔ 4. buy_shares YES — correct shares calculated
    ✔ 5. buy_shares NO — correct shares calculated
    ✔ 6. buy_shares — price shifts after purchase
    ✔ 7. buy_shares — fails on expired market
    ✔ 8. resolve_market — success by admin
    ✔ 9. resolve_market — fails if called before expiry
    ✔ 10. resolve_market — fails if not admin
    ✔ 11. claim_winnings — YES winner claims correctly
    ✔ 12. claim_winnings — NO loser cannot claim
    ✔ 13. claim_winnings — cannot claim twice
    ✔ 14. fee — 2% fee collected correctly

  14 passing
```

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 6000 | EmptyQuestion | Question cannot be empty |
| 6001 | QuestionTooLong | Question exceeds 200 characters |
| 6002 | InvalidTimestamp | End timestamp must be in the future |
| 6003 | MarketExpired | Market has expired |
| 6004 | MarketNotExpiredYet | Market has not expired yet |
| 6005 | MarketAlreadyResolved | Market already resolved |
| 6006 | MarketNotResolved | Market not yet resolved |
| 6007 | InsufficientShares | No winning shares to claim |
| 6008 | AlreadyClaimed | Winnings already claimed |
| 6009 | Unauthorized | Only admin can resolve |
| 6010 | ZeroAmount | Amount must be > 0 |
| 6011 | Overflow | Arithmetic overflow |

## Program ID

```
6VmLghUCKtnihagf4gJ9dv5F7tnrEvuXPS5hpikiy9U8
```
current: Aid5RQWA6UXXTKqSpStHA9CuncyU2ipSjhYAvfsLhk4L

## Known Bugs

### 1. Creator Fee Not Distributed
Creator fee (1%) accumulates in the vault and is paid out to winners instead of the market creator. The `buy_shares` instruction keeps creator fee in vault with no `withdraw_creator_fee` instruction for creator to claim it.

### 2. Resolve Market Authorization
The `resolve_market` instruction accepts `admin_key` as an input parameter and only checks `admin.key() == admin_key`, without verifying the signer is the market creator. Any user can resolve any market by passing their own pubkey as both the signer and `admin_key` parameter.

## License

ISC
