import { PublicKey } from '@solana/web3.js';
import { PROGRAM_ID } from './constants';

export function findMarketPDA(creator: PublicKey, question: string): [PublicKey, number] {
  const crypto = require('crypto');
  const questionHash = crypto.createHash('sha256').update(question).digest();
  return PublicKey.findProgramAddressSync(
    [Buffer.from('market'), creator.toBuffer(), questionHash],
    PROGRAM_ID,
  );
}

export function findVaultPDA(marketPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('vault'), marketPubkey.toBuffer()],
    PROGRAM_ID,
  );
}

export function findCreatorFeeVaultPDA(marketPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('creator_fee'), marketPubkey.toBuffer()],
    PROGRAM_ID,
  );
}

export function findPositionPDA(marketPubkey: PublicKey, userPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('position'), marketPubkey.toBuffer(), userPubkey.toBuffer()],
    PROGRAM_ID,
  );
}

export function findTreasuryPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('treasury')], PROGRAM_ID);
}
