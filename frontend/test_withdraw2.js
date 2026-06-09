const { Connection, PublicKey, Keypair, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } = require('@solana/web3.js');
const fs = require('fs');

const PROGRAM_ID = new PublicKey('C8s7AU4HCN6NNSU9XLWTaJECAqseX41AjTDyRpuJ9TFZ');
const adminKeypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('/home/finish/admin-wallet.json', 'utf-8'))));
const treasuryPDA = new PublicKey('5y25j3BqDRbY7sViUXrdes4RPpQknqSvdZgAKra9RLTa');

const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

async function main() {
  const treasuryBalance = await connection.getBalance(treasuryPDA);
  console.log('Treasury balance:', treasuryBalance, 'lamports');
  if (treasuryBalance < 1000) {
    console.log('Not enough funds to test.');
    return;
  }
  const amount = 500;
  // Build instruction data: 8-byte discriminator + 8-byte amount little-endian
  const discriminator = Buffer.from(require('crypto').createHash('sha256').update('global:withdrawProtocolFees').digest().slice(0, 8));
  const amountBuffer = Buffer.alloc(8);
  amountBuffer.writeBigUInt64LE(BigInt(amount));
  const data = Buffer.concat([discriminator, amountBuffer]);

  const tx = new Transaction().add(new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: treasuryPDA, isWritable: true, isSigner: false },
      { pubkey: adminKeypair.publicKey, isWritable: true, isSigner: false },
      { pubkey: adminKeypair.publicKey, isWritable: false, isSigner: true },
      { pubkey: SystemProgram.programId, isWritable: false, isSigner: false },
    ],
    data,
  }));

  try {
    const sig = await sendAndConfirmTransaction(connection, tx, [adminKeypair]);
    console.log('✅ Withdraw successful. TX:', sig);
  } catch (e) {
    console.error('❌ Error:', e);
  }
}
main();
