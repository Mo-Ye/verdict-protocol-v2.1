import { LAMPORTS_PER_SOL } from './constants';
import type { Category } from './constants';

export interface MarketAccount {
  question: string;
  endTimestamp: { toNumber: () => number };
  yesPool: { toNumber: () => number };
  noPool: { toNumber: () => number };
  totalYesShares: { toNumber: () => number };
  totalNoShares: { toNumber: () => number };
  resolved: boolean;
  outcome: boolean | null;
  creator: { toString: () => string };
  creatorFeeAccumulated?: { toNumber: () => number };
  winningPot?: { toNumber: () => number };
  vaultBump: number;
  creatorFeeVaultBump?: number;
  bump: number;
}

export interface MarketWithKey {
  publicKey: { toString: () => string };
  account: MarketAccount;
}

export interface UserPositionAccount {
  user: { toString: () => string };
  market: { toString: () => string };
  yesShares: { toNumber: () => number };
  noShares: { toNumber: () => number };
  claimed: boolean;
  bump: number;
}

export function calculatePrices(yesPool: number, noPool: number) {
  const total = yesPool + noPool;
  if (total === 0) return { yesPrice: 50, noPrice: 50 };
  const yesPrice = (noPool / total) * 100;
  const noPrice = (yesPool / total) * 100;
  return {
    yesPrice: Math.round(yesPrice * 10) / 10,
    noPrice: Math.round(noPrice * 10) / 10,
  };
}

export function estimateShares(
  yesPool: number,
  noPool: number,
  amountLamports: number,
  isYes: boolean,
): number {
  const fee = Math.floor((amountLamports * 200) / 10_000);
  const amountAfterFee = amountLamports - fee;
  const k = yesPool * noPool;

  if (isYes) {
    const newYesPool = yesPool + amountAfterFee;
    const newNoPool = Math.floor(k / newYesPool);
    return noPool - newNoPool;
  } else {
    const newNoPool = noPool + amountAfterFee;
    const newYesPool = Math.floor(k / newNoPool);
    return yesPool - newYesPool;
  }
}

export function calculatePositionValue(
  shares: number,
  isYes: boolean,
  yesPool: number,
  noPool: number,
): number {
  const total = yesPool + noPool;
  if (total === 0) return 0;
  const price = isYes ? noPool / total : yesPool / total;
  return (shares * price) / LAMPORTS_PER_SOL;
}

export function lamportsToSol(lamports: number): number {
  return lamports / LAMPORTS_PER_SOL;
}

export function solToLamports(sol: number): number {
  return Math.floor(sol * LAMPORTS_PER_SOL);
}

export function formatSol(lamports: number, decimals = 4): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(decimals);
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function getMarketStatus(market: MarketAccount): 'active' | 'expired' | 'resolved' {
  if (market.resolved) return 'resolved';
  const now = Date.now() / 1000;
  if (now >= market.endTimestamp.toNumber()) return 'expired';
  return 'active';
}

export function guessCategory(question: string): Category {
  const q = question.toLowerCase();
  if (q.match(/btc|eth|sol|crypto|bitcoin|ethereum|solana|token|defi|nft/)) return 'crypto';
  if (q.match(/president|election|vote|congress|senate|trump|biden|politics|war|nato/)) return 'politics';
  if (q.match(/world cup|nba|nfl|soccer|football|tennis|champions|olympics|game|match|sport/)) return 'sports';
  if (q.match(/ai|apple|google|microsoft|openai|spacex|tesla|tech|software|launch|release/)) return 'tech';
  return 'other';
}

export function timeUntil(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = timestamp - now;
  if (diff <= 0) return 'Ended';
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((diff % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function isWinningPosition(
  outcome: boolean | null,
  yesShares: number,
  noShares: number,
): boolean {
  if (outcome === null) return false;
  return (outcome && yesShares > 0) || (!outcome && noShares > 0);
}

export function calculateEstimatedPayout(
  vaultBalance: number,
  userWinShares: number,
  totalWinShares: number,
): number {
  if (totalWinShares === 0) return 0;
  return (vaultBalance * userWinShares) / totalWinShares / LAMPORTS_PER_SOL;
}

export function extractErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
