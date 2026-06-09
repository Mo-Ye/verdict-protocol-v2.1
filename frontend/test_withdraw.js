const anchor = require('@coral-xyz/anchor');
const { PublicKey, Keypair, SystemProgram } = require('@solana/web3.js');
const fs = require('fs');

// Učitaj admin wallet
const adminKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync('/home/finish/admin-wallet.json', 'utf-8')))
);

const PROGRAM_ID = new PublicKey('C8s7AU4HCN6NNSU9XLWTaJECAqseX41AjTDyRpuJ9TFZ');

// Izračunaj Treasury PDA
const [treasuryPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('treasury')],
  PROGRAM_ID
);

const connection = new anchor.web3.Connection('https://api.devnet.solana.com', 'confirmed');
const provider = new anchor.AnchorProvider(
  connection,
  { publicKey: adminKeypair.publicKey, signTransaction: async (tx) => { tx.partialSign(adminKeypair); return tx; }, signAllTransactions: async (txs) => { txs.forEach(tx => tx.partialSign(adminKeypair)); return txs; } },
  { commitment: 'confirmed' }
);

// Učitaj IDL i obriši problematične accounts/types
const idl = JSON.parse(fs.readFileSync('/home/finish/verdict-v2-clean/frontend/app/idl/verdict.json', 'utf-8'));
delete idl.accounts;
delete idl.types;
const program = new anchor.Program(idl, PROGRAM_ID, provider);

async function main() {
  console.log('Treasury PDA:', treasuryPDA.toBase58());
  const treasuryBalance = await connection.getBalance(treasuryPDA);
  console.log('Treasury balance:', treasuryBalance / 1e9, 'SOL');

  if (treasuryBalance < 1000) {
    console.log('Trezor nema dovoljno SOL-a za test.');
    return;
  }

  const amount = 500; // 500 lamports (sitno, samo za test)
  console.log('Povlačim', amount, 'lamports...');

  try {
    const tx = await program.methods
      .withdrawProtocolFees(new anchor.BN(amount))
      .accounts({
        treasury: treasuryPDA,
        adminWallet: adminKeypair.publicKey,
        admin: adminKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminKeypair])
      .rpc();
    console.log('✅ Uspešno! TX:', tx);

    const newBalance = await connection.getBalance(treasuryPDA);
    console.log('Novi balance trezora:', newBalance / 1e9, 'SOL');
  } catch (e) {
    console.error('❌ Greška:', e);
  }
}
main();
