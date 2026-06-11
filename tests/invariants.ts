import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { expect } from "chai";
import BN from "bn.js";

const idl = require("../target/idl/verdict.json");
const PROGRAM_ID = new PublicKey("C8s7AU4HCN6NNSU9XLWTaJECAqseX41AjTDyRpuJ9TFZ");

function getQuestionHash(question: string): Buffer {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(question).digest();
}
function findMarketPDA(creator: PublicKey, question: string): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), creator.toBuffer(), getQuestionHash(question)],
    PROGRAM_ID,
  );
}
function findVaultPDA(marketPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), marketPubkey.toBuffer()],
    PROGRAM_ID,
  );
}
function findCreatorFeeVaultPDA(marketPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("creator_fee"), marketPubkey.toBuffer()],
    PROGRAM_ID,
  );
}
function findPositionPDA(marketPubkey: PublicKey, userPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), marketPubkey.toBuffer(), userPubkey.toBuffer()],
    PROGRAM_ID,
  );
}
function findTreasuryPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    PROGRAM_ID,
  );
}

describe("invariants", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl, provider);

  const adminSigner = Keypair.fromSecretKey(
    new Uint8Array(require("../tests/fixtures/admin.json"))
  );
  const adminKey = adminSigner.publicKey;

  let user: Keypair;
  let treasuryPDA: PublicKey;

  before(async () => {
    user = Keypair.generate();
    [treasuryPDA] = findTreasuryPDA();

    try {
      const sig = await provider.connection.requestAirdrop(
        user.publicKey,
        5 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
      console.log("Airdrop OK, user:", user.publicKey.toString());
    } catch (e) {
      console.error("Airdrop failed:", e);
      throw e;
    }

    try {
      const rentExempt = await provider.connection.getMinimumBalanceForRentExemption(0);
      const treasuryBalance = await provider.connection.getBalance(treasuryPDA);
      console.log("Treasury balance:", treasuryBalance, "rentExempt:", rentExempt);
      if (treasuryBalance === 0) {
        const tx = new anchor.web3.Transaction().add(
          SystemProgram.transfer({
            fromPubkey: adminKey,
            toPubkey: treasuryPDA,
            lamports: rentExempt,
          })
        );
        await provider.sendAndConfirm(tx, [adminSigner]);
        console.log("Treasury funded");
      }
    } catch (e) {
      console.error("Treasury fund failed:", e);
      throw e;
    }

    await new Promise((r) => setTimeout(r, 1000));
  });

  // ============================================================
  // INV-1: buy after resolve FAIL
  // ============================================================
  it("INV-1. buy_shares — fails on resolved market", async () => {
    const question = "INV1: resolved market buy?";
    const expiry = Math.floor(Date.now() / 1000) + 2;
    const [marketPDA] = findMarketPDA(adminKey, question);
    const [vaultPDA] = findVaultPDA(marketPDA);
    const [creatorFeeVaultPDA] = findCreatorFeeVaultPDA(marketPDA);
    const [positionPDA] = findPositionPDA(marketPDA, user.publicKey);

    await program.methods
      .createMarket(question, new BN(expiry))
      .accounts({
        market: marketPDA,
        vault: vaultPDA,
        creatorFeeVault: creatorFeeVaultPDA,
        creator: adminKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminSigner])
      .rpc();

    await new Promise((r) => setTimeout(r, 4000));
console.log("adminSigner pubkey:", adminSigner.publicKey.toString());
console.log("adminKey:", adminKey.toString());
    await program.methods
      .resolveMarket(true)
      .accounts({
        market: marketPDA,
        vault: vaultPDA,
        creatorFeeVault: creatorFeeVaultPDA,
        creatorWallet: adminKey,
        admin: adminKey,
        systemProgram: SystemProgram.programId,
      })
     
      .signers([adminSigner])
      .rpc();

    try {
      await program.methods
        .buyShares(new BN(100_000), true)
        .accounts({
          market: marketPDA,
          userPosition: positionPDA,
          vault: vaultPDA,
          treasury: treasuryPDA,
          creatorFeeVault: creatorFeeVaultPDA,
          user: user.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();
      expect.fail("Should have thrown MarketAlreadyResolved");
    } catch (err: any) {
      expect(err.toString()).to.contain("MarketAlreadyResolved");
    }
  });

  // ============================================================
  // INV-2: claim before resolve FAIL
  // ============================================================
  it("INV-2. claim_winnings — fails before market is resolved", async () => {
    const question = "INV2: claim before resolve?";
    const expiry = Math.floor(Date.now() / 1000) + 60;
    const [marketPDA] = findMarketPDA(adminKey, question);
    const [vaultPDA] = findVaultPDA(marketPDA);
    const [creatorFeeVaultPDA] = findCreatorFeeVaultPDA(marketPDA);
    const [positionPDA] = findPositionPDA(marketPDA, user.publicKey);

    await program.methods
      .createMarket(question, new BN(expiry))
      .accounts({
        market: marketPDA,
        vault: vaultPDA,
        creatorFeeVault: creatorFeeVaultPDA,
        creator: adminKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminSigner])
      .rpc();

    await program.methods
      .buyShares(new BN(1_000_000), true)
      .accounts({
        market: marketPDA,
        userPosition: positionPDA,
        vault: vaultPDA,
        treasury: treasuryPDA,
        creatorFeeVault: creatorFeeVaultPDA,
        user: user.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    try {
      await program.methods
        .claimWinnings()
        .accounts({
          market: marketPDA,
          userPosition: positionPDA,
          vault: vaultPDA,
          user: user.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([user])
        .rpc();
      expect.fail("Should have thrown MarketNotResolved");
    } catch (err: any) {
      expect(err.toString()).to.contain("MarketNotResolved");
    }
  });

  // ============================================================
  // INV-3: resolve twice FAIL
  // ============================================================
  it("INV-3. resolve_market — fails if already resolved", async () => {
    const question = "INV3: resolve twice?";
    const expiry = Math.floor(Date.now() / 1000) + 2;
    const [marketPDA] = findMarketPDA(adminKey, question);
    const [vaultPDA] = findVaultPDA(marketPDA);
    const [creatorFeeVaultPDA] = findCreatorFeeVaultPDA(marketPDA);

    await program.methods
      .createMarket(question, new BN(expiry))
      .accounts({
        market: marketPDA,
        vault: vaultPDA,
        creatorFeeVault: creatorFeeVaultPDA,
        creator: adminKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminSigner])
      .rpc();

    await new Promise((r) => setTimeout(r, 4000));

    await program.methods
      .resolveMarket(true)
      .accounts({
        market: marketPDA,
        vault: vaultPDA,
        creatorFeeVault: creatorFeeVaultPDA,
        creatorWallet: adminKey,
        admin: adminKey,
        systemProgram: SystemProgram.programId,
      })
     
      .signers([adminSigner])
      .rpc();

    try {
      await program.methods
        .resolveMarket(false)
        .accounts({
          market: marketPDA,
          vault: vaultPDA,
          creatorFeeVault: creatorFeeVaultPDA,
          creatorWallet: adminKey,
          admin: adminKey,
          systemProgram: SystemProgram.programId,
        })
       
        .signers([adminSigner])
        .rpc();
      expect.fail("Should have thrown MarketAlreadyResolved");
    } catch (err: any) {
      expect(err.toString()).to.contain("MarketAlreadyResolved");
    }
  });

  // ============================================================
  // INV-4: creator refund tačan iznos
  // ============================================================
  it("INV-4. resolve_market — creator receives exact initial_pool_size refund", async () => {
    const question = "INV4: creator refund?";
    const expiry = Math.floor(Date.now() / 1000) + 2;
    const [marketPDA] = findMarketPDA(adminKey, question);
    const [vaultPDA] = findVaultPDA(marketPDA);
    const [creatorFeeVaultPDA] = findCreatorFeeVaultPDA(marketPDA);

    await program.methods
      .createMarket(question, new BN(expiry))
      .accounts({
        market: marketPDA,
        vault: vaultPDA,
        creatorFeeVault: creatorFeeVaultPDA,
        creator: adminKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminSigner])
      .rpc();

    const marketAccount = await (program.account as any).market.fetch(marketPDA);
    const initialPoolSize = marketAccount.initialPoolSize.toNumber();
    const creatorBalanceBefore = await provider.connection.getBalance(adminKey);

    await new Promise((r) => setTimeout(r, 4000));

    await program.methods
      .resolveMarket(true)
      .accounts({
        market: marketPDA,
        vault: vaultPDA,
        creatorFeeVault: creatorFeeVaultPDA,
        creatorWallet: adminKey,
        admin: adminKey,
        systemProgram: SystemProgram.programId,
      })
      
      .signers([adminSigner])
      .rpc();

    const creatorBalanceAfter = await provider.connection.getBalance(adminKey);
    const diff = creatorBalanceAfter - creatorBalanceBefore;

    expect(diff).to.be.greaterThan(initialPoolSize - 10_000);
    expect(diff).to.be.lessThan(initialPoolSize + 10_000);
  });

  // ============================================================
  // INV-5: vault isolation — dva marketa
  // ============================================================
  it("INV-5. vault isolation — claim on market A does not affect market B vault", async () => {
    const questionA = "INV5A: market A isolation?";
    const questionB = "INV5B: market B isolation?";
    const expiry = Math.floor(Date.now() / 1000) + 2;

    const [marketA] = findMarketPDA(adminKey, questionA);
    const [vaultA] = findVaultPDA(marketA);
    const [creatorFeeVaultA] = findCreatorFeeVaultPDA(marketA);
    const [positionA] = findPositionPDA(marketA, user.publicKey);

    const [marketB] = findMarketPDA(adminKey, questionB);
    const [vaultB] = findVaultPDA(marketB);
    const [creatorFeeVaultB] = findCreatorFeeVaultPDA(marketB);

    await program.methods
      .createMarket(questionA, new BN(expiry))
      .accounts({
        market: marketA,
        vault: vaultA,
        creatorFeeVault: creatorFeeVaultA,
        creator: adminKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminSigner])
      .rpc();

    await program.methods
      .createMarket(questionB, new BN(expiry))
      .accounts({
        market: marketB,
        vault: vaultB,
        creatorFeeVault: creatorFeeVaultB,
        creator: adminKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([adminSigner])
      .rpc();

    await program.methods
      .buyShares(new BN(1_000_000), true)
      .accounts({
        market: marketA,
        userPosition: positionA,
        vault: vaultA,
        treasury: treasuryPDA,
        creatorFeeVault: creatorFeeVaultA,
        user: user.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const vaultBBalanceBefore = await provider.connection.getBalance(vaultB);

    await new Promise((r) => setTimeout(r, 4000));

    await program.methods
      .resolveMarket(true)
      .accounts({
        market: marketA,
        vault: vaultA,
        creatorFeeVault: creatorFeeVaultA,
        creatorWallet: adminKey,
        admin: adminKey,
        systemProgram: SystemProgram.programId,
      })
     
      .signers([adminSigner])
      .rpc();

    await program.methods
      .claimWinnings()
      .accounts({
        market: marketA,
        userPosition: positionA,
        vault: vaultA,
        user: user.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([user])
      .rpc();

    const vaultBBalanceAfter = await provider.connection.getBalance(vaultB);
    expect(vaultBBalanceAfter).to.equal(vaultBBalanceBefore);
  });
});