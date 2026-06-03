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

describe("coverage-gaps", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program(idl, provider);
  const creator = provider.wallet;
  const adminKey = provider.wallet.publicKey;

  const user2 = Keypair.generate();

  const [treasuryPDA] = findTreasuryPDA();

  const soon = (secs: number) => Math.floor(Date.now() / 1000) + secs;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function airdrop(pubkey: PublicKey, sol: number) {
    const sig = await provider.connection.requestAirdrop(
      pubkey,
      sol * LAMPORTS_PER_SOL,
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  type MarketPdas = {
    market: PublicKey;
    vault: PublicKey;
    creatorFeeVault: PublicKey;
    creatorPk: PublicKey;
  };

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

  async function claim(m: MarketPdas, claimer: Keypair | typeof creator) {
    const claimerPk = (claimer as any).publicKey as PublicKey;
    const [userPosition] = findPositionPDA(m.market, claimerPk);
    const builder = program.methods.claimWinnings().accounts({
      market: m.market,
      userPosition,
      vault: m.vault,
      user: claimerPk,
      systemProgram: SystemProgram.programId,
    });
    if ((claimer as Keypair).secretKey) {
      builder.signers([claimer as Keypair]);
    }
    await builder.rpc();
  }

  before(async () => {
    await airdrop(user2.publicKey, 10);

    // Ensure treasury is rent-exempt
    const rentExempt =
      await provider.connection.getMinimumBalanceForRentExemption(0);
    const treasuryBal = await provider.connection.getBalance(treasuryPDA);
    if (treasuryBal === 0) {
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
  // create_market — QuestionTooLong
  // ============================================================
  it("CG-1. create_market — fails with question > 200 chars", async () => {
    const longQuestion = "A".repeat(201);
    const [longMarketPDA] = findMarketPDA(creator.publicKey, longQuestion);
    const [longVaultPDA] = findVaultPDA(longMarketPDA);
    const [longCreatorFeeVaultPDA] = findCreatorFeeVaultPDA(longMarketPDA);

    try {
      await program.methods
        .createMarket(longQuestion, new BN(soon(3600)))
        .accounts({
          market: longMarketPDA,
          vault: longVaultPDA,
          creatorFeeVault: longCreatorFeeVaultPDA,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown QuestionTooLong error");
    } catch (err: any) {
      expect(err.toString()).to.contain("QuestionTooLong");
    }
  });

  // ============================================================
  // create_market — exactly 200 chars succeeds
  // ============================================================
  it("CG-2. create_market — succeeds with exactly 200 chars", async () => {
    const q200 = "B".repeat(200);
    const [mPDA] = findMarketPDA(creator.publicKey, q200);
    const [vPDA] = findVaultPDA(mPDA);
    const [cfPDA] = findCreatorFeeVaultPDA(mPDA);

    await program.methods
      .createMarket(q200, new BN(soon(3600)))
      .accounts({
        market: mPDA,
        vault: vPDA,
        creatorFeeVault: cfPDA,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const mkt = await program.account.market.fetch(mPDA);
    expect(mkt.question.length).to.equal(200);
  });

  // ============================================================
  // buy_shares — ZeroAmount
  // ============================================================
  it("CG-3. buy_shares — fails with zero amount", async () => {
    const m = await mkMarket(creator, "CG3 zero amount?", soon(3600));

    try {
      await buy(m, creator, 0, true);
      expect.fail("Should have thrown ZeroAmount error");
    } catch (err: any) {
      expect(err.toString()).to.contain("ZeroAmount");
    }
  });

  // ============================================================
  // buy_shares — MarketAlreadyResolved
  // ============================================================
  it("CG-4. buy_shares — fails on already-resolved market", async () => {
    const m = await mkMarket(creator, "CG4 buy resolved?", soon(2));
    await buy(m, creator, 500_000, true);
    await sleep(3000);
    await resolve(m, true);

    try {
      await buy(m, creator, 500_000, true);
      expect.fail("Should have thrown MarketAlreadyResolved error");
    } catch (err: any) {
      expect(err.toString()).to.contain("MarketAlreadyResolved");
    }
  });

  // ============================================================
  // resolve_market — MarketAlreadyResolved (double resolve)
  // ============================================================
  it("CG-5. resolve_market — fails on double resolve", async () => {
    const m = await mkMarket(creator, "CG5 double resolve?", soon(2));
    await sleep(3000);
    await resolve(m, true);

    try {
      await resolve(m, false);
      expect.fail("Should have thrown MarketAlreadyResolved error");
    } catch (err: any) {
      expect(err.toString()).to.contain("MarketAlreadyResolved");
    }
  });

  // ============================================================
  // claim_winnings — MarketNotResolved
  // ============================================================
  it("CG-6. claim_winnings — fails when market not resolved", async () => {
    const m = await mkMarket(creator, "CG6 claim unresolved?", soon(3600));
    await buy(m, creator, 500_000, true);

    try {
      await claim(m, creator);
      expect.fail("Should have thrown MarketNotResolved error");
    } catch (err: any) {
      expect(err.toString()).to.contain("MarketNotResolved");
    }
  });

  // ============================================================
  // claim_winnings — NO winner claims correctly (outcome = false)
  // ============================================================
  it("CG-7. claim_winnings — NO winner claims after NO outcome", async () => {
    const m = await mkMarket(creator, "CG7 no wins?", soon(3));
    await buy(m, creator, 1_000_000, true); // YES (loser)
    await buy(m, user2, 1_000_000, false); // NO  (winner)

    await sleep(4000);
    await resolve(m, false);

    const balBefore = await provider.connection.getBalance(user2.publicKey);
    await claim(m, user2);
    const balAfter = await provider.connection.getBalance(user2.publicKey);

    // user2 (NO winner) should have received a payout
    expect(balAfter).to.be.greaterThan(balBefore);

    const pos = await program.account.userPosition.fetch(
      findPositionPDA(m.market, user2.publicKey)[0],
    );
    expect(pos.claimed).to.equal(true);
  });

  // ============================================================
  // claim_winnings — YES loser cannot claim when NO wins
  // ============================================================
  it("CG-8. claim_winnings — YES loser cannot claim when NO wins", async () => {
    // Reuse the market from CG-7 by creating a fresh one
    const m = await mkMarket(creator, "CG8 yes loser?", soon(3));
    await buy(m, creator, 1_000_000, true); // YES (loser)
    await buy(m, user2, 1_000_000, false); // NO  (winner)

    await sleep(4000);
    await resolve(m, false);

    try {
      await claim(m, creator);
      expect.fail("Should have thrown InsufficientShares error");
    } catch (err: any) {
      expect(err.toString()).to.contain("InsufficientShares");
    }
  });

  // ============================================================
  // buy_shares — user accumulates shares across multiple buys
  // ============================================================
  it("CG-9. buy_shares — same user accumulates shares", async () => {
    const m = await mkMarket(creator, "CG9 accumulate?", soon(3600));
    await buy(m, creator, 500_000, true);

    const posBefore = await program.account.userPosition.fetch(
      findPositionPDA(m.market, creator.publicKey)[0],
    );
    const sharesBefore = posBefore.yesShares.toNumber();
    expect(sharesBefore).to.be.greaterThan(0);

    await buy(m, creator, 500_000, true);

    const posAfter = await program.account.userPosition.fetch(
      findPositionPDA(m.market, creator.publicKey)[0],
    );
    expect(posAfter.yesShares.toNumber()).to.be.greaterThan(sharesBefore);
  });

  // ============================================================
  // buy_shares — user holds both YES and NO positions
  // ============================================================
  it("CG-10. buy_shares — user can hold both YES and NO shares", async () => {
    const m = await mkMarket(creator, "CG10 both sides?", soon(3600));
    await buy(m, creator, 500_000, true);
    await buy(m, creator, 500_000, false);

    const pos = await program.account.userPosition.fetch(
      findPositionPDA(m.market, creator.publicKey)[0],
    );
    expect(pos.yesShares.toNumber()).to.be.greaterThan(0);
    expect(pos.noShares.toNumber()).to.be.greaterThan(0);
  });
});
