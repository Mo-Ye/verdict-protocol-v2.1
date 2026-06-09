import { NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { Program, AnchorProvider, Idl } from '@coral-xyz/anchor';
import idl from '../../../idl/verdict.json';

const PROGRAM_ID = new PublicKey('C8s7AU4HCN6NNSU9XLWTaJECAqseX41AjTDyRpuJ9TFZ');
const RPC = 'https://api.devnet.solana.com';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const connection = new Connection(RPC, 'confirmed');
    const provider = new AnchorProvider(connection, {} as any, {});
    const program = new Program(idl as Idl, provider);

    const marketPDA = new PublicKey(id);
    const m = await (program.account as any).market.fetch(marketPDA);

    return NextResponse.json({
      publicKey: marketPDA.toString(),
      question: m.question,
      endTimestamp: m.endTimestamp.toNumber(),
      yesPool: m.yesPool.toNumber(),
      noPool: m.noPool.toNumber(),
      totalYesShares: m.totalYesShares.toNumber(),
      totalNoShares: m.totalNoShares.toNumber(),
      resolved: m.resolved,
      outcome: m.outcome,
      creator: m.creator.toString(),
      creatorFeeAccumulated: m.creatorFeeAccumulated.toNumber(),
      winningPot: m.winningPot.toNumber(),
      initialPoolSize: m.initialPoolSize.toNumber(),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}