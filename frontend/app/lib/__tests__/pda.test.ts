import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  findMarketPDA,
  findVaultPDA,
  findCreatorFeeVaultPDA,
  findPositionPDA,
  findTreasuryPDA,
} from '../pda';
import { PROGRAM_ID } from '../constants';

const creator = new PublicKey('EBBkuBxBRsctjb8RdPSPMCfZvn217bqPkg45VDUdic6T');
const user = new PublicKey('4zLY3ctGsunFvBNPsFZKxDj7xRVwuG4Ni2U8kgEk7n99');

describe('findMarketPDA', () => {
  it('returns a valid PublicKey and bump', () => {
    const [pda, bump] = findMarketPDA(creator, 'Will BTC reach 100k?');
    expect(pda).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
  });

  it('is deterministic (same inputs → same output)', () => {
    const [a] = findMarketPDA(creator, 'Same question');
    const [b] = findMarketPDA(creator, 'Same question');
    expect(a.equals(b)).toBe(true);
  });

  it('produces different PDAs for different questions', () => {
    const [a] = findMarketPDA(creator, 'Question A');
    const [b] = findMarketPDA(creator, 'Question B');
    expect(a.equals(b)).toBe(false);
  });

  it('produces different PDAs for different creators', () => {
    const [a] = findMarketPDA(creator, 'Same question');
    const [b] = findMarketPDA(user, 'Same question');
    expect(a.equals(b)).toBe(false);
  });
});

describe('findVaultPDA', () => {
  it('returns a valid PublicKey and bump', () => {
    const [market] = findMarketPDA(creator, 'test');
    const [vault, bump] = findVaultPDA(market);
    expect(vault).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic', () => {
    const [market] = findMarketPDA(creator, 'test');
    const [a] = findVaultPDA(market);
    const [b] = findVaultPDA(market);
    expect(a.equals(b)).toBe(true);
  });
});

describe('findCreatorFeeVaultPDA', () => {
  it('returns a valid PublicKey and bump', () => {
    const [market] = findMarketPDA(creator, 'test');
    const [cfv, bump] = findCreatorFeeVaultPDA(market);
    expect(cfv).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
  });

  it('differs from the main vault PDA', () => {
    const [market] = findMarketPDA(creator, 'test');
    const [vault] = findVaultPDA(market);
    const [cfv] = findCreatorFeeVaultPDA(market);
    expect(vault.equals(cfv)).toBe(false);
  });
});

describe('findPositionPDA', () => {
  it('returns a valid PublicKey and bump', () => {
    const [market] = findMarketPDA(creator, 'test');
    const [pos, bump] = findPositionPDA(market, user);
    expect(pos).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
  });

  it('produces different PDAs for different users', () => {
    const [market] = findMarketPDA(creator, 'test');
    const [a] = findPositionPDA(market, creator);
    const [b] = findPositionPDA(market, user);
    expect(a.equals(b)).toBe(false);
  });

  it('produces different PDAs for different markets', () => {
    const [m1] = findMarketPDA(creator, 'market 1');
    const [m2] = findMarketPDA(creator, 'market 2');
    const [a] = findPositionPDA(m1, user);
    const [b] = findPositionPDA(m2, user);
    expect(a.equals(b)).toBe(false);
  });
});

describe('findTreasuryPDA', () => {
  it('returns a valid PublicKey and bump', () => {
    const [treasury, bump] = findTreasuryPDA();
    expect(treasury).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
  });

  it('is a singleton (always same result)', () => {
    const [a] = findTreasuryPDA();
    const [b] = findTreasuryPDA();
    expect(a.equals(b)).toBe(true);
  });
});

describe('PDA cross-consistency with program tests', () => {
  it('uses the expected PROGRAM_ID', () => {
    expect(PROGRAM_ID.toString()).toBe('Aid5RQWA6UXXTKqSpStHA9CuncyU2ipSjhYAvfsLhk4L');
  });

  it('market PDA is off-curve (not a valid ed25519 point)', () => {
    const [pda] = findMarketPDA(creator, 'test');
    // findProgramAddressSync guarantees the result is off-curve,
    // so it should not throw when used as a PDA
    expect(PublicKey.isOnCurve(pda.toBytes())).toBe(false);
  });
});
