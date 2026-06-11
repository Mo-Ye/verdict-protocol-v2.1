# Verdict Protocol — REST API

Read-only HTTP endpoints for querying on-chain market data.
No authentication required. All values in lamports unless noted.

**Base URL (devnet):** `http://localhost:3000` (self-hosted)  
**Program ID:** `C8s7AU4HCN6NNSU9XLWTaJECAqseX41AjTDyRpuJ9TFZ`  
**Network:** Solana Devnet

---

## Endpoints

### `GET /api/markets`
Returns all prediction markets.

**Request**
GET /api/markets

**Response**
```json
{
  "markets": [
    {
      "publicKey": "AjhD1QpCXuqTdpcwX9zridwEXWvAiA3vd4CzF8wZUKNV",
      "question": "Will SOL reach $200 by end of year?",
      "endTimestamp": 1780890900,
      "yesPool": 5050506,
      "noPool": 19800000,
      "totalYesShares": 0,
      "totalNoShares": 4949494,
      "resolved": true,
      "outcome": false,
      "creator": "F77xEgsrgB7WCsZJvWzrW2ks5Dt7oPZeFqfyZqx3pt67",
      "creatorFeeAccumulated": 0,
      "winningPot": 9800000,
      "initialPoolSize": 20000000
    }
  ]
}
```

---

### `GET /api/markets/:id`
Returns a single market by its public key.

**Request**
GET /api/markets/AjhD1QpCXuqTdpcwX9zridwEXWvAiA3vd4CzF8wZUKNV

**Response**
```json
{
  "publicKey": "AjhD1QpCXuqTdpcwX9zridwEXWvAiA3vd4CzF8wZUKNV",
  "question": "Will SOL reach $200 by end of year?",
  "endTimestamp": 1780890900,
  "yesPool": 5050506,
  "noPool": 19800000,
  "totalYesShares": 0,
  "totalNoShares": 4949494,
  "resolved": true,
  "outcome": false,
  "creator": "F77xEgsrgB7WCsZJvWzrW2ks5Dt7oPZeFqfyZqx3pt67",
  "creatorFeeAccumulated": 0,
  "winningPot": 9800000,
  "initialPoolSize": 20000000
}
```

**Errors**
```json
{ "error": "Invalid public key input" }
```

---

### `GET /api/creator/:wallet`
Returns all markets created by a specific wallet.

**Request**
GET /api/creator/F77xEgsrgB7WCsZJvWzrW2ks5Dt7oPZeFqfyZqx3pt67

**Response**
```json
{
  "markets": [
    {
      "publicKey": "AjhD1QpCXuqTdpcwX9zridwEXWvAiA3vd4CzF8wZUKNV",
      "question": "Will SOL reach $200 by end of year?",
      "endTimestamp": 1780890900,
      "yesPool": 5050506,
      "noPool": 19800000,
      "resolved": true,
      "outcome": false,
      "creator": "F77xEgsrgB7WCsZJvWzrW2ks5Dt7oPZeFqfyZqx3pt67",
      "creatorFeeAccumulated": 0,
      "initialPoolSize": 20000000
    }
  ]
}
```

---

## Field Reference

| Field | Type | Description |
|-------|------|-------------|
| `publicKey` | string | Market PDA address |
| `question` | string | The prediction question |
| `endTimestamp` | number | Unix timestamp when market expires |
| `yesPool` | number | Current YES pool size (lamports) |
| `noPool` | number | Current NO pool size (lamports) |
| `totalYesShares` | number | Total YES shares issued |
| `totalNoShares` | number | Total NO shares issued |
| `resolved` | boolean | Whether market has been resolved |
| `outcome` | boolean \| null | `true` = YES won, `false` = NO won, `null` = unresolved |
| `creator` | string | Creator wallet address |
| `creatorFeeAccumulated` | number | Pending creator fee (lamports) |
| `winningPot` | number | Total prize pool snapshot (lamports) |
| `initialPoolSize` | number | Initial liquidity deposited by creator (lamports) |

---

## PDA Derivation

Builders can derive PDAs client-side using the following seeds:

```typescript
// Market PDA
PublicKey.findProgramAddressSync(
  [Buffer.from('market'), creatorPubkey.toBuffer(), sha256(question)],
  PROGRAM_ID
)

// Vault PDA
PublicKey.findProgramAddressSync(
  [Buffer.from('vault'), marketPubkey.toBuffer()],
  PROGRAM_ID
)

// User Position PDA
PublicKey.findProgramAddressSync(
  [Buffer.from('position'), marketPubkey.toBuffer(), userPubkey.toBuffer()],
  PROGRAM_ID
)
```