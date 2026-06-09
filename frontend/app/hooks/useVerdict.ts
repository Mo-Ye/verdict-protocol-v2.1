'use client';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { useMemo } from 'react';
import idl from '../idl/verdict.json';

const PROGRAM_ID = new PublicKey('C8s7AU4HCN6NNSU9XLWTaJECAqseX41AjTDyRpuJ9TFZ');

export function useVerdict() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const readonlyProgram = useMemo(() => {
    const provider = new AnchorProvider(connection, {
      publicKey: PublicKey.default,
      signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) => tx,
      signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) => txs,
    } as any, { commitment: 'confirmed' });
    return new Program(idl as Idl, provider);
  }, [connection]);

  const program = useMemo(() => {
    if (!wallet.publicKey) return null;
    const provider = new AnchorProvider(connection, wallet as any, {
      commitment: 'confirmed',
    });
    return new Program(idl as Idl, provider);
  }, [connection, wallet]);

  return { program, readonlyProgram, wallet, connection };
}