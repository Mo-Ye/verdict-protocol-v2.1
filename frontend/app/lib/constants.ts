import { PublicKey } from '@solana/web3.js';

export const PROGRAM_ID = new PublicKey('Aid5RQWA6UXXTKqSpStHA9CuncyU2ipSjhYAvfsLhk4L');

// Hardcoded protocol admin — matches PROTOCOL_ADMIN in the Anchor program.
// Can resolve any market and withdraw protocol fees from the treasury.
export const PROTOCOL_ADMIN = new PublicKey('EBBkuBxBRsctjb8RdPSPMCfZvn217bqPkg45VDUdic6T');

export const LAMPORTS_PER_SOL = 1_000_000_000;

export const CATEGORIES = ['crypto', 'politics', 'sports', 'tech', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

export const LOCALES = ['en', 'es', 'fr', 'ru', 'sr'] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_FLAGS: Record<Locale, string> = {
  en: '\uD83C\uDDEC\uD83C\uDDE7',
  es: '\uD83C\uDDEA\uD83C\uDDF8',
  fr: '\uD83C\uDDEB\uD83C\uDDF7',
  ru: '\uD83C\uDDF7\uD83C\uDDFA',
  sr: '\uD83C\uDDF7\uD83C\uDDF8',
};
