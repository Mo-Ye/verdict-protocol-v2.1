# Verdict Protocol — Roadmap

Verdict is building real-time collective forecasting markets on Solana. This roadmap outlines the technical direction, grant milestones, and long-term vision.

---

## Current State — Phase 1 Complete ✅

The foundation is live on Solana devnet with a fully audited test suite.

- Constant-product AMM pricing (K = yes_pool × no_pool)
- Creator fee incentives — 1% of every trade goes to the market creator
- Protocol fee treasury — 1% of every trade to protocol
- Creator + admin market resolution with authorization checks
- Initial liquidity refund to creator on resolution
- REST API — `/api/markets`, `/api/markets/:id`, `/api/creator/:wallet`
- **32/32 tests passing** across functional, accounting, edge case, stress, and invariant suites
- Program deployed on Solana devnet: `C8s7AU4HCN6NNSU9XLWTaJECAqseX41AjTDyRpuJ9TFZ`

---

## Grant Milestones

### Milestone 1 — Pyth Oracle + AI Layer
**Timeline: 8 weeks | Budget: $3,000**

The first milestone eliminates manual resolution for price-based markets and introduces an AI classification layer at market creation.

**Program changes:**
- Pyth oracle integration for automatic market resolution
- `resolution_type` field added to Market struct (`Auto` | `Manual`)
- `target_price` and `pyth_feed_id` fields for price-based markets
- `resolve_market` reads Pyth price feed on-chain and resolves automatically when condition is met
- Support for crypto, forex, and commodity price feeds (400+ Pyth feeds available)
- Test suite expanded to 45+ tests covering Pyth resolution paths

**AI layer (frontend/backend):**
- Market classification — AI determines whether a question is Pyth-solvable or requires manual resolution
- Resolution criteria generator — AI proposes clear, unambiguous resolution rules for each market
- Duplicate detection — AI checks new markets against existing ones before creation, preventing spam

**Resolution flow:**
```
Creator submits question
        ↓
AI classifies: Pyth-solvable or Manual?
        ↓
Pyth-solvable          Manual
     ↓                    ↓
Store feed ID        Creator or PROTOCOL_ADMIN
+ target price       resolves after expiry
     ↓
resolve_market reads
Pyth on-chain,
resolves automatically
```

**Deliverables:**
- Updated program deployed on devnet with Pyth integration
- 45+ passing tests
- AI classification working in frontend
- Documentation updated

---

### Milestone 2 — Mainnet + SDK + API
**Timeline: 8 weeks | Budget: $3,000**

The second milestone takes Verdict to mainnet and opens the protocol to external builders.

**Mainnet deployment:**
- Security review prior to mainnet deploy
- Minimum creator liquidity enforced (0.1 SOL at market creation, refunded on resolution)
- Mainnet program verified and documented

**TypeScript SDK:**
- PDA derivation helpers
- Transaction builders for all instructions (`createMarket`, `buyShares`, `resolveMarket`, `claimWinnings`)
- Pyth feed lookup utilities
- Full TypeScript types for all program accounts

**Infrastructure:**
- WebSocket price feeds for live market probability updates
- Full API documentation published
- SDK published to npm

**AI quality layer:**
- Quality scoring — AI rates each market 1-10 on clarity, measurability, and resolution criteria before publication
- Markets below threshold receive a warning before submission

**KPI target:** 200 Monthly Active Traders (MAT) on mainnet
*(MAT = unique wallets executing at least one `buy_shares` transaction in a calendar month — verifiable on-chain)*

---

### Milestone 3 — Creator Economy + Traction
**Timeline: 14 weeks | Budget: $4,000**

The third milestone builds the creator layer that drives long-term growth and market quality, including a novel fee marketplace mechanism.

**Creator profiles and leaderboard:**
- Creator profiles — markets created, total volume, resolution accuracy, earnings
- Creator leaderboard — ranked by volume, accuracy, and trader engagement
- Reputation system — on-chain score based on market quality and resolution history
- Fee visibility — creators can track accumulated fees in real time

**Creator Fee Marketplace:**

Creators can fractionalize their 1% fee stream and sell shares to the community:

- Creator divides fee stream into shares (e.g. 1000 units)
- Community members purchase fee shares for SOL upfront
- Each fee share holder receives a proportional cut of every trade on that market
- Creator retains majority ownership (minimum 50%) — prevents flipping
- Fee share buyers are financially incentivized to promote the market (higher volume = higher earnings)

Example: Creator sells 400/1000 fee shares. A buyer holding 100/1000 shares receives 0.1% of all trading volume. On a market with 100 SOL total volume, that buyer earns 0.1 SOL.

This creates a viral growth loop — fee share holders become natural promoters of the markets they invest in.

**AI intelligence layer:**
- Sentiment summary — AI interprets current market odds and volume into readable context on each market page
- Creator assistance — AI suggests relevant market questions based on current events, helping onboard new creators

**KPI target:** 1,000 Monthly Active Traders on mainnet

---

## Long-Term Vision — Beyond Grant

### Phase 4 — Composability
- On-chain CPI integrations — other Solana programs can read Verdict market state
- External frontend support — any developer can build on top of Verdict using the SDK
- Analytics tooling — market history, probability curves, volume charts

### Phase 5 — Real-World Oracle Integration
Non-price markets (politics, sports, culture) currently require manual resolution. Future integration with optimistic oracle protocols will enable automatic resolution for real-world events:
- **UMA Protocol** — optimistic oracle with 48h challenge period
- **Kleros** — decentralized arbitration for disputed outcomes (see phase 7)

### Phase 6 — Hybrid Liquidity
Exploration of OpenBook CLOB integration for high-volume markets alongside the existing AMM. AMM remains the default for new and low-volume markets; CLOB becomes available when market maker liquidity justifies it.

### Phase 7 — Verdict Arbitration Layer Kleros-inspired 
Decentralized dispute resolution built natively on Solana. Random juror selection, stake-based accountability, appeals system. Natural evolution for subjective market resolution as the protocol matures.

---

## KPI Summary

| Milestone | Timeline | Budget | Primary KPI | Verification |
|-----------|----------|--------|-------------|--------------|
| M1 | 8 weeks | $3,000 | 45+ tests passing, Pyth resolving on devnet | GitHub, on-chain |
| M2 | 8 weeks | $3,000 | 200 MAT on mainnet | On-chain wallet activity |
| M3 | 14 weeks | $4,000 | 1,000 MAT on mainnet | On-chain wallet activity |
| **Total** | **~7.5 months** | **$10,000** | | |

**Why Monthly Active Traders:**
MAT is on-chain, cannot be gamed, and directly measures whether users find value in the protocol. It grows naturally with market quality and creator activity.

**Failure condition:**
If MAT is below 200 after mainnet launch, the team will reassess market quality standards and creator incentive structure before proceeding to M3.

---

## What Verdict Is Not Building

To stay focused:

- No protocol token (premature)
- No DAO governance (premature)
- No NFT gamification
- No order book before sufficient volume exists
- No AI-generated markets (AI assists humans, does not replace them)

---

## Grant Narrative

> "Verdict Protocol is building real-time collective forecasting markets on Solana — combining automatic Pyth oracle resolution, AI-assisted market quality, and a novel creator fee marketplace where community members co-own the upside of high-quality markets. Infrastructure for market intelligence, not a betting app."
