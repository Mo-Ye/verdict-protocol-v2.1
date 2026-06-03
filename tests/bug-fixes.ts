import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
} from "@solana/web3.js";
import { expect } from "chai";
import BN from "bn.js";

const idl = require("../target/idl/verdict.json");

const PROGRAM_ID = new PublicKey(
  "Aid5RQWA6UXXTKqSpStHA9CuncyU2ipSjhYAvfsLhk4L",
);

function getQuestionHash(question: string): Buffer {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(question).digest();
}

function findMarketPDA(
  creator: PublicKey,
  question: string,
): [PublicKey, number] {
  const questionHash = getQuestionHash(question);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), creator.toBuffer(), questionHash],
    PROGRAM_ID,
  );
}

function findVaultPDA(marketPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), marketPubkey.toBuffer()],
    PROGRAM_ID,
  );
}

function findPositionPDA(
  marketPubkey: PublicKey,
  userPubkey: PublicKey,
): [PublicKey, number] {
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

function findCreatorFeeVaultPDA(marketPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("creator_fee"), marketPubkey.toBuffer()],
    PROGRAM_ID,
  );
}

const INITIAL_POOL_SIZE = 10_000_000;

describe("bug-fixes", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = new Program(idl, provider);
  const creator = provider.wallet;
  const adminKey = provider.wallet.publicKey;
  const user2 = Keypair.generate();

  let treasuryPDA: PublicKey;

  const soon = (secs: number) => Math.floor(Date.now() / 1000) + secs;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  type MarketPdas = {
    market: PublicKey;
    vault: PublicKey;
    creatorFeeVault: PublicKey;
    creatorPk: PublicKey;
  };

  async function airdrop(pubkey: PublicKey, sol: number) {
    const sig = await provider.connection.requestAirdrop(
      pubkey,
      sol * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  async function mkMarket(
    creatorSigner: Keypair | typeof creator,
    question: string,
    endTimestamp: number,
  ): Promise<MarketPdas> {
    const creatorPk = (creatorSigner as any).publicKey as PublicKey;
    const [market] = findMarketPDA(creatorPk, question);
    const [vault] = findVaultPDA(market);
    const [creatorFeeVault] = findCreatorFeeVaultPDA(market);
    const builder = program.methods
      .createMarket(question, new BN(endTimestamp))
      .accounts({
        market,
        vault,
        creatorFeeVault,
        creator: creatorPk,
        systemProgram: SystemProgram.programId,
      });
    if ((creatorSigner as Keypair).secretKey) {
      builder.signers([creatorSigner as Keypair]);
    }
    await builder.rpc();
    return { market, vault, creatorFeeVault, creatorPk };
  }

  async function buy(
    m: MarketPdas,
    buyer: Keypair | typeof creator,
    amount: number,
    isYes: boolean,
  ) {
    const buyerPk = (buyer as any).publicKey as PublicKey;
    const [userPosition] = findPositionPDA(m.market, buyerPk);
    const builder = program.methods.buyShares(new BN(amount), isYes).accounts({
      market: m.market,
      userPosition,
      vault: m.vault,
      treasury: treasuryPDA,
      creatorFeeVault: m.creatorFeeVault,
      user: buyerPk,
      systemProgram: SystemProgram.programId,
    });
    if ((buyer as Keypair).secretKey) {
      builder.signers([buyer as Keypair]);
    }
    await builder.rpc();
  }

  async function resolve(
    m: MarketPdas,
    outcome: boolean,
    adminSigner?: Keypair,
  ) {
    const builder = program.methods.resolveMarket(outcome).accounts({
      market: m.market,
      creatorFeeVault: m.creatorFeeVault,
      creatorWallet: m.creatorPk,
      admin: adminSigner ? adminSigner.publicKey : adminKey,
      systemProgram: SystemProgram.programId,
    });
    if (adminSigner) builder.signers([adminSigner]);
    await builder.rpc();
  }

  before(async () => {
    [treasuryPDA] = findTreasuryPDA();
    await airdrop(user2.publicKey, 5);

    const rentExempt =
      await provider.connection.getMinimumBalanceForRentExemption(0);
    const treasuryBalance = await provider.connection.getBalance(treasuryPDA);
    if (treasuryBalance === 0) {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: creator.publicKey,
          toPubkey: treasuryPDA,
          lamports: rentExempt,
        }),
      );
      await provider.sendAndConfirm(tx);
    }
  });

  // ============================================================
  // BF-1: Creator fee payout via direct lamport transfer
  // ============================================================
  it("BF-1. creator fee — vault drains to rent-exempt, wallet credited", async () => {
    const m = await mkMarket(user2, "BF-1 creator fee payout?", soon(3));
    // Buy to generate creator fees
    await buy(m, creator, 2_000_000, true);
    await buy(m, creator, 1_000_000, false);

    const marketBefore = await program.account.market.fetch(m.market);
    const accumulated = marketBefore.creatorFeeAccumulated.toNumber();
    expect(accumulated).to.be.greaterThan(0);

    const rentExempt =
      await provider.connection.getMinimumBalanceForRentExemption(0);
    const feeVaultBefore = await provider.connection.getBalance(
      m.creatorFeeVault,
    );
    expect(feeVaultBefore).to.equal(rentExempt + accumulated);

    const walletBefore = await provider.connection.getBalance(user2.publicKey);

    await sleep(4000);
    await resolve(m, true);

    // Creator fee accumulated reset to 0
    const marketAfter = await program.account.market.fetch(m.market);
    expect(marketAfter.creatorFeeAccumulated.toNumber()).to.equal(0);

    // Fee vault drained to rent-exempt only
    const feeVaultAfter = await provider.connection.getBalance(
      m.creatorFeeVault,
    );
    expect(feeVaultAfter).to.equal(rentExempt);

    // Creator wallet received exactly the accumulated fee
    const walletAfter = await provider.connection.getBalance(user2.publicKey);
    expect(walletAfter - walletBefore).to.equal(accumulated);
  });

  // ============================================================
  // BF-2: Zero-share buy rejected
  // ============================================================
  it("BF-2. buy_shares — dust amount yielding 0 shares rejected", async () => {
    const m = await mkMarket(creator, "BF-2 zero share guard?", soon(3600));
    // 1 lamport: fee=0, amount_after_fee=1
    // ceil(10_000_000*10_000_000 / 10_000_001) = 10_000_000 → shares = 0
    try {
      await buy(m, creator, 1, true);
      expect.fail("Should have thrown ZeroAmount error");
    } catch (err: any) {
      expect(err.toString()).to.contain("ZeroAmount");
    }
  });

  it("BF-2b. buy_shares — 2 lamports yields ≥ 1 share (just above dust)", async () => {
    const m = await mkMarket(creator, "BF-2b above dust?", soon(3600));
    await buy(m, creator, 2, true);
    const pos = await program.account.userPosition.fetch(
      findPositionPDA(m.market, creator.publicKey)[0],
    );
    expect(pos.yesShares.toNumber()).to.be.greaterThanOrEqual(1);
  });

  // ============================================================
  // BF-3: AMM K non-decreasing (ceiling division)
  // ============================================================
  it("BF-3. buy_shares — K never decreases across multiple trades", async () => {
    const m = await mkMarket(creator, "BF-3 K invariant?", soon(3600));

    let prevK = INITIAL_POOL_SIZE * INITIAL_POOL_SIZE;
    const amounts = [
      500_000, 300_000, 1_000_000, 200_000, 700_000, 150_000, 400_000, 800_000,
    ];

    for (let i = 0; i < amounts.length; i++) {
      const isYes = i % 2 === 0;
      await buy(m, creator, amounts[i], isYes);

      const mkt = await program.account.market.fetch(m.market);
      const currentK = mkt.yesPool.toNumber() * mkt.noPool.toNumber();
      expect(currentK).to.be.greaterThanOrEqual(
        prevK,
        `K decreased at trade ${i + 1}: ${currentK} < ${prevK}`,
      );
      prevK = currentK;
    }
  });

  // ============================================================
  // BF-4: Treasury rent-exempt guard
  // ============================================================
  it("BF-4. withdraw_protocol_fees — cannot drain below rent-exempt", async () => {
    // First, generate some treasury fees
    const m = await mkMarket(creator, "BF-4 rent exempt?", soon(3600));
    await buy(m, creator, 5_000_000, true);

    const treasuryBalance = await provider.connection.getBalance(treasuryPDA);
    const rentExempt =
      await provider.connection.getMinimumBalanceForRentExemption(0);
    const withdrawable = treasuryBalance - rentExempt;

    // Withdrawing exactly the withdrawable amount should succeed
    if (withdrawable > 0) {
      await program.methods
        .withdrawProtocolFees(new BN(withdrawable))
        .accounts({
          treasury: treasuryPDA,
          admin: adminKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const afterWithdraw = await provider.connection.getBalance(treasuryPDA);
      expect(afterWithdraw).to.equal(rentExempt);
    }

    // Now try to withdraw 1 more lamport — should fail
    try {
      await program.methods
        .withdrawProtocolFees(new BN(1))
        .accounts({
          treasury: treasuryPDA,
          admin: adminKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown InsufficientTreasuryBalance error");
    } catch (err: any) {
      expect(err.toString()).to.contain("InsufficientTreasuryBalance");
    }
  });

  it("BF-4b. withdraw_protocol_fees — full balance withdraw blocked", async () => {
    // Generate fresh fees
    const m = await mkMarket(creator, "BF-4b full drain?", soon(3600));
    await buy(m, creator, 10_000_000, true);

    const treasuryBalance = await provider.connection.getBalance(treasuryPDA);
    // Try to withdraw the entire balance (including rent-exempt portion)
    try {
      await program.methods
        .withdrawProtocolFees(new BN(treasuryBalance))
        .accounts({
          treasury: treasuryPDA,
          admin: adminKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown InsufficientTreasuryBalance error");
    } catch (err: any) {
      expect(err.toString()).to.contain("InsufficientTreasuryBalance");
    }
  });
});
