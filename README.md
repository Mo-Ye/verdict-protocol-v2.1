# Verdict Protocol

**Collective forecasting markets powered by Solana.**

Verdict is building a forecasting network — not a betting app, not a Polymarket clone. It is infrastructure for real-time collective intelligence, built natively on Solana.

Three directions define where Verdict is going:

**1. Market Intelligence** — A place where the internet forecasts reality. High-signal markets across crypto, AI, macro, and culture. Probabilities as live information, not just odds.

**2. Creator Economy** — Anyone can launch a market and earn 1% of all trading volume. Creators are forecasters. The protocol rewards signal, not spam.

**3. Composability** — Open REST API, deterministic PDA derivation, future SDK and WebSocket feeds. Verdict is infrastructure other builders can integrate, not a closed platform.

---

**Program ID:** `C8s7AU4HCN6NNSU9XLWTaJECAqseX41AjTDyRpuJ9TFZ`
**Network:** Solana Devnet
**Status:** Live on devnet — 32/32 tests passing

---

## Protocol Overview

### Instructions

| Instruction | Description |
|-------------|-------------|
| `create_market(question, end_timestamp)` | Creates a binary forecasting market. Creator deposits initial AMM liquidity, refunded on resolution. |
| `buy_shares(amount_in, is_yes)` | Buys YES or NO shares via constant-product AMM. 2% fee split between protocol and creator. |
| `resolve_market(outcome)` | Resolves market after expiry. Callable by market creator or `PROTOCOL_ADMIN`. Refunds creator deposit and pays out accumulated creator fees. |
| `claim_winnings()` | Claims proportional payout from the prize pool for winning share holders. |
| `withdraw_protocol_fees(amount)` | Withdraws accumulated protocol fees from treasury. Only callable by `PROTOCOL_ADMIN`. |

### Fee Structure

| Fee | Rate | Destination |
|-----|------|-------------|
| Protocol fee | 1% of trade | Treasury PDA |
| Creator fee | 1% of trade | Creator fee vault (paid out on resolution) |

### Constant Product AMM

Verdict uses a constant-product formula (`K = yes_pool × no_pool`) for share pricing:

- Initial pools: `yes_pool = 10,000,000`, `no_pool = 10,000,000` (50/50 odds)
- Buying YES adds SOL to `yes_pool`, reducing `no_pool` — YES price increases
- Shares out = difference in the opposing pool after the trade
- Price naturally shifts with each trade, reflecting collective sentiment

### PDAs

| PDA | Seeds | Purpose |
|-----|-------|---------|
| Market | `["market", creator, sha256(question)]` | Market state and AMM pools |
| Vault | `["vault", market]` | SOL prize pool |
| Creator Fee Vault | `["creator_fee", market]` | Accumulated creator fees |
| Treasury | `["treasury"]` | Protocol fee accumulation |
| UserPosition | `["position", market, user]` | Per-user share holdings |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Verdict Program                         │
├──────────────┬─────────────┬──────────────┬─────────────────┤
│ create_market│  buy_shares │resolve_market│  claim_winnings │
│              │    (AMM)    │              │                 │
├──────────────┴─────────────┴──────────────┴─────────────────┤
│                                                              │
│  Market PDA           UserPosition PDA                       │
│  ┌────────────────┐   ┌──────────────┐                       │
│  │ question       │   │ yes_shares   │                       │
│  │ yes_pool       │   │ no_shares    │                       │
│  │ no_pool        │   │ claimed      │                       │
│  │ resolved       │   └──────────────┘                       │
│  │ outcome        │                                          │
│  │ creator        │   Vault PDA        Creator Fee Vault     │
│  │ initial_pool   │   (prize pool)     (1% per trade)        │
│  │ winning_pot    │                                          │
│  └────────────────┘   Treasury PDA                          │
│                        (protocol fees)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## REST API

Read-only HTTP endpoints for querying on-chain market data.
Full documentation: [`docs/API.md`](docs/API.md)

```
GET /api/markets
GET /api/markets/:id
GET /api/creator/:wallet
```

---

## Getting Started

### Prerequisites

- Rust + Cargo (`rustup`)
- Solana CLI
- Node.js 18+
- `npm install`

### Local Testing

See [`docs/TESTING.md`](docs/TESTING.md) for the complete local testing guide.

Quick start:

```bash
# Build with local-admin feature
cargo build-sbf -- --features local-admin

# Start local validator (separate terminal)
solana-test-validator --reset

# Airdrop SOL
solana airdrop 10 HESGaak1WvAXvepem8GQAjhrKDXtkfT6Eb8zZeLg9JTU --url localhost
solana airdrop 60 $(solana-keygen pubkey tests/fixtures/admin.json) --url localhost

# Deploy
solana program deploy target/deploy/verdict.so --keypair ~/deploy-devnet.json --url localhost

# Run tests
ANCHOR_PROVIDER_URL=http://localhost:8899 \
ANCHOR_WALLET=tests/fixtures/admin.json \
./node_modules/.bin/ts-mocha --timeout 120000 tests/verdict.ts tests/invariants.ts
```

---

## Test Suite — 32/32 Passing

```
  verdict
    ✔ 1. create_market — success
    ✔ 2. create_market — fails with empty question
    ✔ 3. create_market — fails with past timestamp
    ✔ 4. buy_shares YES — correct shares calculated
    ✔ 5. buy_shares NO — correct shares calculated
    ✔ 6. buy_shares — price shifts after purchase (YES more expensive)
    ✔ 7. buy_shares — fails on expired market
    ✔ 8. resolve_market — success by admin
    ✔ 9. resolve_market — fails if called before expiry
    ✔ 10. resolve_market — fails if not admin
    ✔ 11. claim_winnings — YES winner claims correctly
    ✔ 12. claim_winnings — NO loser cannot claim
    ✔ 13. claim_winnings — cannot claim twice
    ✔ 14. fee — 2% fee collected correctly
    ✔ 15. withdraw_protocol_fees — admin withdraws from treasury
    ✔ 16. withdraw_protocol_fees — non-admin cannot withdraw
    ✔ 17. withdraw_protocol_fees — amount over balance fails
    ✔ 18. withdraw_protocol_fees — zero amount fails
    ✔ 19. resolve_market — admin resolves market created by user2
    ✔ A.  only YES buyers — vault drains to 0, creator fee paid
    ✔ B.  YES-heavy vs NO — winners split pot, losers get nothing
    ✔ C.  multiple users & purchases — proportional, conserved
    ✔ D.  all winners claim — vault reaches ~0
    ✔ E1. boundary timestamp — buy before expiry ok, after fails, resolve ok
    ✔ E2. tiny amount — 1 lamport buy rejected (zero shares after ceiling division)
    ✔ E3. large amount — 50 SOL buy keeps AMM math sound
    ✔ F.  randomized stress — conservation of funds across many trades

  invariants
    ✔ INV-1. buy_shares — fails on resolved market
    ✔ INV-2. claim_winnings — fails before market is resolved
    ✔ INV-3. resolve_market — fails if already resolved
    ✔ INV-4. resolve_market — creator receives exact initial_pool_size refund
    ✔ INV-5. vault isolation — claim on market A does not affect market B vault

  32 passing
```

---

## Error Codes

| Code | Name | Description |
|------|------|-------------|
| 6000 | `EmptyQuestion` | Question cannot be empty |
| 6001 | `QuestionTooLong` | Question exceeds 200 characters |
| 6002 | `InvalidTimestamp` | End timestamp must be in the future |
| 6003 | `MarketExpired` | Market has expired, trading closed |
| 6004 | `MarketNotExpiredYet` | Market has not expired yet |
| 6005 | `MarketAlreadyResolved` | Market already resolved |
| 6006 | `MarketNotResolved` | Market not yet resolved |
| 6007 | `InsufficientShares` | No winning shares to claim |
| 6008 | `AlreadyClaimed` | Winnings already claimed |
| 6009 | `Unauthorized` | Only creator or PROTOCOL_ADMIN can resolve |
| 6010 | `ZeroAmount` | Amount must be greater than zero |
| 6011 | `Overflow` | Arithmetic overflow |
| 6012 | `InsufficientTreasuryBalance` | Treasury balance too low to withdraw |

---

## Roadmap

Full roadmap with milestones, timelines, and grant details: [`ROADMAP.md`](ROADMAP.md)

### Phase 1 — Foundation ✅
- Constant-product AMM pricing
- Creator fee incentives (1% per trade)
- Protocol fee treasury
- Admin + creator resolution
- Initial liquidity refund on resolution
- REST API
- 32/32 test coverage

### Phase 2 — Pyth Oracle + AI *(8 weeks)*
- Automatic market resolution via Pyth price feeds
- AI market classification (Pyth-solvable vs manual)
- AI resolution criteria generator
- AI duplicate detection
- 45+ tests

### Phase 3 — Mainnet + SDK *(8 weeks)*
- Security review + mainnet deployment
- TypeScript SDK
- WebSocket price feeds
- Full API documentation

### Phase 4 — Creator Economy *(14 weeks)*
- Creator profiles and leaderboards
- Creator reputation system
- **Creator Fee Marketplace** — fractionalized fee stream, community co-ownership of market upside
- 1,000 Monthly Active Traders target

### Phase 5 — Composability
- On-chain CPI integrations
- External frontend support
- Analytics tooling

### Phase 6 — Real-World Oracles + Hybrid Liquidity
- UMA / Kleros integration for non-price market resolution
- OpenBook CLOB exploration for high-volume markets

---

## License

ISC
