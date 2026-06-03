import { describe, it, expect } from 'vitest';
import {
  calculatePrices,
  estimateShares,
  calculatePositionValue,
  lamportsToSol,
  solToLamports,
  formatSol,
  shortenAddress,
  getMarketStatus,
  guessCategory,
  timeUntil,
} from '../market-utils';
import type { MarketAccount } from '../market-utils';

const LAMPORTS_PER_SOL = 1_000_000_000;

// ---------------------------------------------------------------------------
// calculatePrices
// ---------------------------------------------------------------------------
describe('calculatePrices', () => {
  it('returns 50/50 for equal pools', () => {
    const { yesPrice, noPrice } = calculatePrices(1000, 1000);
    expect(yesPrice).toBe(50);
    expect(noPrice).toBe(50);
  });

  it('returns 50/50 when both pools are zero', () => {
    const { yesPrice, noPrice } = calculatePrices(0, 0);
    expect(yesPrice).toBe(50);
    expect(noPrice).toBe(50);
  });

  it('returns higher YES price when NO pool is larger', () => {
    const { yesPrice, noPrice } = calculatePrices(1000, 3000);
    expect(yesPrice).toBe(75);
    expect(noPrice).toBe(25);
  });

  it('returns higher NO price when YES pool is larger', () => {
    const { yesPrice, noPrice } = calculatePrices(3000, 1000);
    expect(yesPrice).toBe(25);
    expect(noPrice).toBe(75);
  });

  it('rounds to one decimal place', () => {
    const { yesPrice, noPrice } = calculatePrices(1000, 2000);
    // noPool/(yes+no)*100 = 2000/3000*100 = 66.666... → 66.7
    expect(yesPrice).toBe(66.7);
    expect(noPrice).toBe(33.3);
  });

  it('handles very large pool values', () => {
    const { yesPrice, noPrice } = calculatePrices(10_000_000_000, 10_000_000_000);
    expect(yesPrice).toBe(50);
    expect(noPrice).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// estimateShares
// ---------------------------------------------------------------------------
describe('estimateShares', () => {
  const INITIAL = 10_000_000;

  it('returns positive shares for a YES buy', () => {
    const shares = estimateShares(INITIAL, INITIAL, 500_000, true);
    expect(shares).toBeGreaterThan(0);
  });

  it('returns positive shares for a NO buy', () => {
    const shares = estimateShares(INITIAL, INITIAL, 500_000, false);
    expect(shares).toBeGreaterThan(0);
  });

  it('matches the on-chain CPMM formula', () => {
    const amount = 500_000;
    const fee = Math.floor((amount * 200) / 10_000);
    const afterFee = amount - fee;
    const k = INITIAL * INITIAL;
    const newYes = INITIAL + afterFee;
    const newNo = Math.floor(k / newYes);
    const expected = INITIAL - newNo;
    expect(estimateShares(INITIAL, INITIAL, amount, true)).toBe(expected);
  });

  it('YES and NO shares from the same input are symmetric on a balanced pool', () => {
    const yShares = estimateShares(INITIAL, INITIAL, 1_000_000, true);
    const nShares = estimateShares(INITIAL, INITIAL, 1_000_000, false);
    expect(yShares).toBe(nShares);
  });

  it('returns 0 shares for a 0-lamport input', () => {
    expect(estimateShares(INITIAL, INITIAL, 0, true)).toBe(0);
  });

  it('larger input yields more shares', () => {
    const small = estimateShares(INITIAL, INITIAL, 100_000, true);
    const large = estimateShares(INITIAL, INITIAL, 1_000_000, true);
    expect(large).toBeGreaterThan(small);
  });
});

// ---------------------------------------------------------------------------
// calculatePositionValue
// ---------------------------------------------------------------------------
describe('calculatePositionValue', () => {
  it('returns 0 when total pool is 0', () => {
    expect(calculatePositionValue(100, true, 0, 0)).toBe(0);
  });

  it('returns correct value for YES position', () => {
    // price = noPool / total = 1000 / 2000 = 0.5
    // value = 100 * 0.5 / 1e9
    const val = calculatePositionValue(100, true, 1000, 1000);
    expect(val).toBeCloseTo(100 * 0.5 / LAMPORTS_PER_SOL, 15);
  });

  it('returns correct value for NO position', () => {
    // price = yesPool / total = 1000 / 2000 = 0.5
    const val = calculatePositionValue(100, false, 1000, 1000);
    expect(val).toBeCloseTo(100 * 0.5 / LAMPORTS_PER_SOL, 15);
  });
});

// ---------------------------------------------------------------------------
// lamportsToSol / solToLamports / formatSol
// ---------------------------------------------------------------------------
describe('lamportsToSol', () => {
  it('converts lamports to SOL', () => {
    expect(lamportsToSol(1_000_000_000)).toBe(1);
    expect(lamportsToSol(500_000_000)).toBe(0.5);
    expect(lamportsToSol(0)).toBe(0);
  });
});

describe('solToLamports', () => {
  it('converts SOL to lamports (floored)', () => {
    expect(solToLamports(1)).toBe(1_000_000_000);
    expect(solToLamports(0.5)).toBe(500_000_000);
    expect(solToLamports(0)).toBe(0);
  });

  it('floors fractional lamports', () => {
    // 0.0000000001 SOL = 0.1 lamports → floor to 0
    expect(solToLamports(0.0000000001)).toBe(0);
  });
});

describe('formatSol', () => {
  it('formats lamports as SOL string with default decimals', () => {
    expect(formatSol(1_000_000_000)).toBe('1.0000');
  });

  it('respects custom decimals', () => {
    expect(formatSol(1_500_000_000, 2)).toBe('1.50');
  });

  it('formats 0 correctly', () => {
    expect(formatSol(0)).toBe('0.0000');
  });
});

// ---------------------------------------------------------------------------
// shortenAddress
// ---------------------------------------------------------------------------
describe('shortenAddress', () => {
  const addr = 'EBBkuBxBRsctjb8RdPSPMCfZvn217bqPkg45VDUdic6T';

  it('shortens with default chars=4', () => {
    expect(shortenAddress(addr)).toBe('EBBk...ic6T');
  });

  it('shortens with custom chars', () => {
    expect(shortenAddress(addr, 6)).toBe('EBBkuB...Udic6T');
  });
});

// ---------------------------------------------------------------------------
// getMarketStatus
// ---------------------------------------------------------------------------
describe('getMarketStatus', () => {
  const mk = (resolved: boolean, endTs: number): MarketAccount =>
    ({
      resolved,
      endTimestamp: { toNumber: () => endTs },
    }) as MarketAccount;

  it('returns "resolved" when market is resolved', () => {
    expect(getMarketStatus(mk(true, 0))).toBe('resolved');
  });

  it('returns "expired" when end timestamp is in the past', () => {
    const past = Math.floor(Date.now() / 1000) - 3600;
    expect(getMarketStatus(mk(false, past))).toBe('expired');
  });

  it('returns "active" when end timestamp is in the future', () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    expect(getMarketStatus(mk(false, future))).toBe('active');
  });
});

// ---------------------------------------------------------------------------
// guessCategory
// ---------------------------------------------------------------------------
describe('guessCategory', () => {
  it('detects crypto keywords', () => {
    expect(guessCategory('Will BTC reach 100k?')).toBe('crypto');
    expect(guessCategory('Is Ethereum going up?')).toBe('crypto');
    expect(guessCategory('Solana TVL question')).toBe('crypto');
  });

  it('detects politics keywords', () => {
    expect(guessCategory('Will Biden win?')).toBe('politics');
    expect(guessCategory('Next election results')).toBe('politics');
  });

  it('detects sports keywords', () => {
    expect(guessCategory('Who wins the NBA finals?')).toBe('sports');
    expect(guessCategory('World Cup champion')).toBe('sports');
  });

  it('detects tech keywords', () => {
    expect(guessCategory('Will OpenAI release GPT-5?')).toBe('tech');
    expect(guessCategory('Apple new launch')).toBe('tech');
  });

  it('returns "other" for unmatched questions', () => {
    expect(guessCategory('What is the meaning of life?')).toBe('other');
  });
});

// ---------------------------------------------------------------------------
// timeUntil
// ---------------------------------------------------------------------------
describe('timeUntil', () => {
  it('returns "Ended" for a past timestamp', () => {
    const past = Math.floor(Date.now() / 1000) - 100;
    expect(timeUntil(past)).toBe('Ended');
  });

  it('returns days and hours for a far-future timestamp', () => {
    const future = Math.floor(Date.now() / 1000) + 2 * 86400 + 3600;
    expect(timeUntil(future)).toMatch(/^2d \d+h$/);
  });

  it('returns hours and minutes when less than a day', () => {
    const future = Math.floor(Date.now() / 1000) + 3700;
    expect(timeUntil(future)).toMatch(/^1h \d+m$/);
  });
});
