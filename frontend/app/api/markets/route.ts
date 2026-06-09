import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import idl from '../../idl/verdict.json';

const PROGRAM_ID = new PublicKey('C8s7AU4HCN6NNSU9XLWTaJECAqseX41AjTDyRpuJ9TFZ');
const RPC = 'https://api.devnet.solana.com';

export async function GET() {
  try {
    const connection = new Connection(RPC, 'confirmed');
    const provider = new AnchorProvider(connection, {} as any, {});
    const program = new Program(idl as Idl, provider);

    const markets = await (program.account as any).market.all();

    const data = markets.map((m: any) => ({
      publicKey: m.publicKey.toString(),
      question: m.account.question,
      endTimestamp: m.account.endTimestamp.toNumber(),
      yesPool: m.account.yesPool.toNumber(),
      noPool: m.account.noPool.toNumber(),
      totalYesShares: m.account.totalYesShares.toNumber(),
      totalNoShares: m.account.totalNoShares.toNumber(),
      resolved: m.account.resolved,
      outcome: m.account.outcome,
      creator: m.account.creator.toString(),
      creatorFeeAccumulated: m.account.creatorFeeAccumulated.toNumber(),
      winningPot: m.account.winningPot.toNumber(),
      initialPoolSize: m.account.initialPoolSize.toNumber(),
    }));

    return NextResponse.json({ markets: data });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}