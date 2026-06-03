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

export const CATEGORY_COLORS: Record<string, string> = {
  crypto: 'bg-orange-500/20 text-orange-300',
  politics: 'bg-blue-500/20 text-blue-300',
  sports: 'bg-green-500/20 text-green-300',
  tech: 'bg-purple-500/20 text-purple-300',
  other: 'bg-gray-500/20 text-gray-300',
};

export const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-300',
  expired: 'bg-yellow-500/20 text-yellow-300',
  resolved: 'bg-blue-500/20 text-blue-300',
};
