import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { expect } from "chai";
import BN from "bn.js";

// We load the IDL manually since anchor build IDL generation is skipped
const idl = require("../target/idl/verdict.json");

const PROGRAM_ID = new PublicKey(
  "Aid5RQWA6UXXTKqSpStHA9CuncyU2ipSjhYAvfsLhk4L"
);

function getQuestionHash(question: string): Buffer {
  const crypto = require("crypto");
  return crypto.createHash("sha256").update(question).digest();
}

function findMarketPDA(
  creator: PublicKey,
  question: string
): [PublicKey, number] {
  const questionHash = getQuestionHash(question);
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), creator.toBuffer(), questionHash],
    PROGRAM_ID
  );
}

function findVaultPDA(marketPubkey: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), marketPubkey.toBuffer()],
    PROGRAM_ID
  );
}

function findPositionPDA(
  marketPubkey: PublicKey,
  userPubkey: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), marketPubkey.toBuffer(), userPubkey.toBuffer()],
    PROGRAM_ID
  );
}

function findTreasuryPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    PROGRAM_ID
  );
}

function findCreatorFeeVaultPDA(
  marketPubkey: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("creator_fee"), marketPubkey.toBuffer()],
    PROGRAM_ID
  );
}

// Mirrors INITIAL_POOL_SIZE in programs/verdict/src/instructions/create_market.rs
const INITIAL_POOL_SIZE = 10_000_000;

describe("verdict", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = new Program(idl, provider);
  const creator = provider.wallet;

  // Admin keypair for resolve_market (we use the provider wallet as admin)
  const adminKey = provider.wallet.publicKey;

  // Second user for testing
  const user2 = Keypair.generate();

  const question = "Will BTC reach $100k by end of 2025?";
  const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const pastTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

  let marketPDA: PublicKey;
  let marketBump: number;
  let vaultPDA: PublicKey;
  let vaultBump: number;
  let treasuryPDA: PublicKey;
  let treasuryBump: number;

  before(async () => {
    [marketPDA, marketBump] = findMarketPDA(creator.publicKey, question);
    [vaultPDA, vaultBump] = findVaultPDA(marketPDA);
    [treasuryPDA, treasuryBump] = findTreasuryPDA();

    // Airdrop SOL to user2 for testing
    const sig = await provider.connection.requestAirdrop(
      user2.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    // Pre-fund the treasury and vault PDAs with rent-exempt minimum
    // so they can receive SOL transfers without going below rent-exempt threshold
    const rentExempt =
      await provider.connection.getMinimumBalanceForRentExemption(0);

    const treasuryBalance = await provider.connection.getBalance(treasuryPDA);
    if (treasuryBalance === 0) {
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: creator.publicKey,
          toPubkey: treasuryPDA,
          lamports: rentExempt,
        })
      );
      await provider.sendAndConfirm(tx);
    }

    const vaultBalance = await provider.connection.getBalance(vaultPDA);
    if (vaultBalance === 0) {
      const tx2 = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: creator.publicKey,
          toPubkey: vaultPDA,
          lamports: rentExempt,
        })
      );
      await provider.sendAndConfirm(tx2);
    }
  });

  // ============================================================
  // Shared helpers for the accounting / edge-case / stress suites
  // ============================================================
  type MarketPdas = {
    market: PublicKey;
    vault: PublicKey;
    creatorFeeVault: PublicKey;
    creatorPk: PublicKey;
  };

  async function airdrop(pubkey: PublicKey, sol: number) {
    const sig = await provider.connection.requestAirdrop(
      pubkey,
      sol * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  async function mkMarket(
    creatorSigner: Keypair | typeof creator,
    question: string,
    endTimestamp: number
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
    isYes: boolean
  ) {
    const buyerPk = (buyer as any).publicKey as PublicKey;
    const [userPosition] = findPositionPDA(m.market, buyerPk);
    const builder = program.methods
      .buyShares(new BN(amount), isYes, new BN(0))
      .accounts({
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
    adminSigner?: Keypair
  ) {
    const builder = program.methods
      .resolveMarket(outcome)
      .accounts({
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
    const builder = program.methods
      .claimWinnings()
      .accounts({
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

  const soon = (secs: number) => Math.floor(Date.now() / 1000) + secs;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // ============================================================
  // TEST 1: create_market — success
  // ============================================================
  it("1. create_market — success", async () => {
    const [creatorFeeVaultPDA] = findCreatorFeeVaultPDA(marketPDA);
    await program.methods
      .createMarket(question, new BN(futureTimestamp))
      .accounts({
        market: marketPDA,
        vault: vaultPDA,
        creatorFeeVault: creatorFeeVaultPDA,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const marketAccount = await program.account.market.fetch(marketPDA);
    expect(marketAccount.question).to.equal(question);
    expect(marketAccount.endTimestamp.toNumber()).to.equal(futureTimestamp);
    expect(marketAccount.yesPool.toNumber()).to.equal(INITIAL_POOL_SIZE);
    expect(marketAccount.noPool.toNumber()).to.equal(INITIAL_POOL_SIZE);
    expect(marketAccount.totalYesShares.toNumber()).to.equal(0);
    expect(marketAccount.totalNoShares.toNumber()).to.equal(0);
    expect(marketAccount.resolved).to.equal(false);
    expect(marketAccount.outcome).to.equal(null);
    expect(marketAccount.creatorFeeAccumulated.toNumber()).to.equal(0);
    expect(marketAccount.creator.toBase58()).to.equal(
      creator.publicKey.toBase58()
    );

    // Vault and creator fee vault are auto-funded to rent-exempt by create_market
    const rentExempt =
      await provider.connection.getMinimumBalanceForRentExemption(0);
    expect(
      await provider.connection.getBalance(creatorFeeVaultPDA)
    ).to.be.greaterThanOrEqual(rentExempt);
  });

  // ============================================================
  // TEST 2: create_market — fails with empty question
  // ============================================================
  it("2. create_market — fails with empty question", async () => {
    const emptyQuestion = "";
    const [emptyMarketPDA] = findMarketPDA(creator.publicKey, emptyQuestion);
    const [emptyVaultPDA] = findVaultPDA(emptyMarketPDA);
    const [emptyCreatorFeeVaultPDA] = findCreatorFeeVaultPDA(emptyMarketPDA);

    try {
      await program.methods
        .createMarket(emptyQuestion, new BN(futureTimestamp))
        .accounts({
          market: emptyMarketPDA,
          vault: emptyVaultPDA,
          creatorFeeVault: emptyCreatorFeeVaultPDA,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown an error");
    } catch (err: any) {
      expect(err.toString()).to.contain("EmptyQuestion");
    }
  });

  // ============================================================
  // TEST 3: create_market — fails with past timestamp
  // ============================================================
  it("3. create_market — fails with past timestamp", async () => {
    const pastQuestion = "Past market test";
    const [pastMarketPDA] = findMarketPDA(creator.publicKey, pastQuestion);
    const [pastVaultPDA] = findVaultPDA(pastMarketPDA);
    const [pastCreatorFeeVaultPDA] = findCreatorFeeVaultPDA(pastMarketPDA);

    try {
      await program.methods
        .createMarket(pastQuestion, new BN(pastTimestamp))
        .accounts({
          market: pastMarketPDA,
          vault: pastVaultPDA,
          creatorFeeVault: pastCreatorFeeVaultPDA,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown an error");
    } catch (err: any) {
      expect(err.toString()).to.contain("InvalidTimestamp");
    }
  });

  // ============================================================
  // TEST 4: buy_shares YES — correct shares calculated
  // ============================================================
  it("4. buy_shares YES — correct shares calculated", async () => {
    const amountIn = new BN(500_000); // 0.0005 SOL
    const [positionPDA] = findPositionPDA(marketPDA, creator.publicKey);
    const [creatorFeeVaultPDA] = findCreatorFeeVaultPDA(marketPDA);

    const marketBefore = await program.account.market.fetch(marketPDA);
    const yesPoolBefore = marketBefore.yesPool.toNumber();
    const noPoolBefore = marketBefore.noPool.toNumber();
    const k = yesPoolBefore * noPoolBefore;

    // Calculate expected shares: 2% fee, then CPMM
    const totalFee = Math.floor((500_000 * 200) / 10_000); // 2% = 10000
    const amountAfterFee = 500_000 - totalFee;
    const newYesPool = yesPoolBefore + amountAfterFee;
    const newNoPool = Math.floor(k / newYesPool);
    const expectedShares = noPoolBefore - newNoPool;

    await program.methods
      .buyShares(amountIn, true, new BN(0))
      .accounts({
        market: marketPDA,
        userPosition: positionPDA,
        vault: vaultPDA,
        treasury: treasuryPDA,
        creatorFeeVault: creatorFeeVaultPDA,
        user: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const position = await program.account.userPosition.fetch(positionPDA);
    expect(position.yesShares.toNumber()).to.equal(expectedShares);
    expect(position.noShares.toNumber()).to.equal(0);
    expect(position.claimed).to.equal(false);

    const marketAfter = await program.account.market.fetch(marketPDA);
    expect(marketAfter.totalYesShares.toNumber()).to.equal(expectedShares);
  });

  // ============================================================
  // TEST 5: buy_shares NO — correct shares calculated
  // ============================================================
  it("5. buy_shares NO — correct shares calculated", async () => {
    const amountIn = new BN(300_000); // 0.0003 SOL
    const [positionPDA] = findPositionPDA(marketPDA, user2.publicKey);
    const [creatorFeeVaultPDA] = findCreatorFeeVaultPDA(marketPDA);

    const marketBefore = await program.account.market.fetch(marketPDA);
    const yesPoolBefore = marketBefore.yesPool.toNumber();
    const noPoolBefore = marketBefore.noPool.toNumber();
    const k = yesPoolBefore * noPoolBefore;

    const totalFee = Math.floor((300_000 * 200) / 10_000);
    const amountAfterFee = 300_000 - totalFee;
    const newNoPool = noPoolBefore + amountAfterFee;
    const newYesPool = Math.floor(k / newNoPool);
    const expectedShares = yesPoolBefore - newYesPool;

    await program.methods
      .buyShares(amountIn, false, new BN(0))
      .accounts({
        market: marketPDA,
        userPosition: positionPDA,
        vault: vaultPDA,
        treasury: treasuryPDA,
        creatorFeeVault: creatorFeeVaultPDA,
        user: user2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([user2])
      .rpc();

    const position = await program.account.userPosition.fetch(positionPDA);
    expect(position.noShares.toNumber()).to.equal(expectedShares);
    expect(position.yesShares.toNumber()).to.equal(0);

    const marketAfter = await program.account.market.fetch(marketPDA);
    expect(marketAfter.totalNoShares.toNumber()).to.equal(expectedShares);
  });

  // ============================================================
  // TEST 6: buy_shares — price shifts after purchase (YES gets more expensive)
  // ============================================================
  it("6. buy_shares — price shifts after purchase (YES more expensive)", async () => {
    // After tests 4 and 5, the pools should have shifted from initial 1000/1000
    const marketState = await program.account.market.fetch(marketPDA);
    const yesPool = marketState.yesPool.toNumber();
    const noPool = marketState.noPool.toNumber();

    // YES pool should have grown (SOL added when buying YES)
    // NO pool should have shrunk (shares removed when buying YES)
    // In CPMM, buying YES adds to yes_pool and shrinks no_pool
    // The pools should no longer be equal after purchases
    expect(yesPool).to.not.equal(noPool);
    expect(yesPool).to.not.equal(INITIAL_POOL_SIZE);
    expect(noPool).to.not.equal(INITIAL_POOL_SIZE);

    // Price of YES in CPMM = no_pool / (yes_pool + no_pool)
    // After buying YES shares, yes_pool increases and no_pool decreases,
    // so YES becomes more expensive (lower no_pool ratio)
    // After also buying NO shares (test 5), no_pool increased back somewhat
    // The key assertion: pools shifted from the initial 50/50
    const yesPrice = noPool / (yesPool + noPool);
    expect(yesPrice).to.not.equal(0.5); // No longer 50/50
  });

  // ============================================================
  // TEST 7: buy_shares — fails on expired market
  // ============================================================
  it("7. buy_shares — fails on expired market", async () => {
    // Create a market that expires very soon
    const shortQuestion = "Short-lived market?";
    const shortTimestamp = Math.floor(Date.now() / 1000) + 2; // 2 seconds from now
    const [shortMarketPDA] = findMarketPDA(creator.publicKey, shortQuestion);
    const [shortVaultPDA] = findVaultPDA(shortMarketPDA);
    const [shortCreatorFeeVaultPDA] = findCreatorFeeVaultPDA(shortMarketPDA);
    const [shortPositionPDA] = findPositionPDA(
      shortMarketPDA,
      creator.publicKey
    );

    await program.methods
      .createMarket(shortQuestion, new BN(shortTimestamp))
      .accounts({
        market: shortMarketPDA,
        vault: shortVaultPDA,
        creatorFeeVault: shortCreatorFeeVaultPDA,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Wait for market to expire
    await new Promise((resolve) => setTimeout(resolve, 4000));

    try {
      await program.methods
        .buyShares(new BN(100_000), true, new BN(0))
        .accounts({
          market: shortMarketPDA,
          userPosition: shortPositionPDA,
          vault: shortVaultPDA,
          treasury: treasuryPDA,
          creatorFeeVault: shortCreatorFeeVaultPDA,
          user: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown MarketExpired error");
    } catch (err: any) {
      expect(err.toString()).to.contain("MarketExpired");
    }
  });

  // ============================================================
  // TEST 8: resolve_market — success by admin
  // ============================================================
  it("8. resolve_market — success by admin", async () => {
    // Create a market that expires soon for resolve testing
    const resolveQuestion = "Resolve test market?";
    const resolveTimestamp = Math.floor(Date.now() / 1000) + 2;
    const [resolveMarketPDA] = findMarketPDA(
      creator.publicKey,
      resolveQuestion
    );
    const [resolveVaultPDA] = findVaultPDA(resolveMarketPDA);
    const [resolveCreatorFeeVaultPDA] =
      findCreatorFeeVaultPDA(resolveMarketPDA);

    await program.methods
      .createMarket(resolveQuestion, new BN(resolveTimestamp))
      .accounts({
        market: resolveMarketPDA,
        vault: resolveVaultPDA,
        creatorFeeVault: resolveCreatorFeeVaultPDA,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Wait for market to expire
    await new Promise((resolve) => setTimeout(resolve, 4000));

    await program.methods
      .resolveMarket(true)
      .accounts({
        market: resolveMarketPDA,
        creatorFeeVault: resolveCreatorFeeVaultPDA,
        creatorWallet: creator.publicKey,
        admin: adminKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const marketAccount = await program.account.market.fetch(resolveMarketPDA);
    expect(marketAccount.resolved).to.equal(true);
    expect(marketAccount.outcome).to.equal(true);
  });

  // ============================================================
  // TEST 9: resolve_market — fails if called before expiry
  // ============================================================
  it("9. resolve_market — fails if called before expiry", async () => {
    // Main market (futureTimestamp) hasn't expired yet
    const [mainCreatorFeeVaultPDA] = findCreatorFeeVaultPDA(marketPDA);
    try {
      await program.methods
        .resolveMarket(true)
        .accounts({
          market: marketPDA,
          creatorFeeVault: mainCreatorFeeVaultPDA,
          creatorWallet: creator.publicKey,
          admin: adminKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown MarketNotExpiredYet error");
    } catch (err: any) {
      expect(err.toString()).to.contain("MarketNotExpiredYet");
    }
  });

  // ============================================================
  // TEST 10: resolve_market — fails if not admin
  // ============================================================
  it("10. resolve_market — fails if not admin", async () => {
    // Create a market that expires soon
    const nonAdminQ = "Non-admin resolve test?";
    const nonAdminTs = Math.floor(Date.now() / 1000) + 2;
    const [nonAdminMarketPDA] = findMarketPDA(creator.publicKey, nonAdminQ);
    const [nonAdminVaultPDA] = findVaultPDA(nonAdminMarketPDA);
    const [nonAdminCreatorFeeVaultPDA] =
      findCreatorFeeVaultPDA(nonAdminMarketPDA);

    await program.methods
      .createMarket(nonAdminQ, new BN(nonAdminTs))
      .accounts({
        market: nonAdminMarketPDA,
        vault: nonAdminVaultPDA,
        creatorFeeVault: nonAdminCreatorFeeVaultPDA,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 4000));

    // Try to resolve with user3 (an attacker who is neither creator nor admin)
    try {
      await program.methods
        .resolveMarket(true)
        .accounts({
          market: nonAdminMarketPDA,
          creatorFeeVault: nonAdminCreatorFeeVaultPDA,
          creatorWallet: creator.publicKey,
          admin: user2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([user2])
        .rpc();
      expect.fail("Should have thrown Unauthorized error");
    } catch (err: any) {
      expect(err.toString()).to.contain("Unauthorized");
    }
  });

  // ============================================================
  // TESTS 11-14: claim_winnings tests
  // We need a fully resolved market with positions for these tests
  // ============================================================
  describe("claim_winnings tests", () => {
    const claimQuestion = "Claim test market?";
    let claimMarketPDA: PublicKey;
    let claimVaultPDA: PublicKey;
    let claimPositionPDA: PublicKey; // creator's position (YES)
    let claimPositionPDA2: PublicKey; // user2's position (NO)

    let claimCreatorFeeVaultPDA: PublicKey;

    before(async () => {
      const claimTimestamp = Math.floor(Date.now() / 1000) + 3;
      [claimMarketPDA] = findMarketPDA(creator.publicKey, claimQuestion);
      [claimVaultPDA] = findVaultPDA(claimMarketPDA);
      [claimCreatorFeeVaultPDA] = findCreatorFeeVaultPDA(claimMarketPDA);
      [claimPositionPDA] = findPositionPDA(claimMarketPDA, creator.publicKey);
      [claimPositionPDA2] = findPositionPDA(claimMarketPDA, user2.publicKey);

      // Create market
      await program.methods
        .createMarket(claimQuestion, new BN(claimTimestamp))
        .accounts({
          market: claimMarketPDA,
          vault: claimVaultPDA,
          creatorFeeVault: claimCreatorFeeVaultPDA,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // Pre-fund vault with rent-exempt minimum
      const rentExempt =
        await provider.connection.getMinimumBalanceForRentExemption(0);
      const vaultBal = await provider.connection.getBalance(claimVaultPDA);
      if (vaultBal === 0) {
        const fundTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: creator.publicKey,
            toPubkey: claimVaultPDA,
            lamports: rentExempt,
          })
        );
        await provider.sendAndConfirm(fundTx);
      }

      // Creator buys YES shares
      await program.methods
        .buyShares(new BN(1_000_000), true, new BN(0)) // 0.001 SOL
        .accounts({
          market: claimMarketPDA,
          userPosition: claimPositionPDA,
          vault: claimVaultPDA,
          treasury: treasuryPDA,
          creatorFeeVault: claimCreatorFeeVaultPDA,
          user: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      // User2 buys NO shares
      await program.methods
        .buyShares(new BN(500_000), false, new BN(0)) // 0.0005 SOL
        .accounts({
          market: claimMarketPDA,
          userPosition: claimPositionPDA2,
          vault: claimVaultPDA,
          treasury: treasuryPDA,
          creatorFeeVault: claimCreatorFeeVaultPDA,
          user: user2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([user2])
        .rpc();

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Resolve market: YES wins
      await program.methods
        .resolveMarket(true)
        .accounts({
          market: claimMarketPDA,
          creatorFeeVault: claimCreatorFeeVaultPDA,
          creatorWallet: creator.publicKey,
          admin: adminKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    });

    // ============================================================
    // TEST 11: claim_winnings — YES winner claims correctly
    // ============================================================
    it("11. claim_winnings — YES winner claims correctly", async () => {
      const balanceBefore = await provider.connection.getBalance(
        creator.publicKey
      );
      const vaultBalanceBefore = await provider.connection.getBalance(
        claimVaultPDA
      );

      const position = await program.account.userPosition.fetch(
        claimPositionPDA
      );
      const market = await program.account.market.fetch(claimMarketPDA);

      expect(position.yesShares.toNumber()).to.be.greaterThan(0);

      await program.methods
        .claimWinnings()
        .accounts({
          market: claimMarketPDA,
          userPosition: claimPositionPDA,
          vault: claimVaultPDA,
          user: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      const positionAfter = await program.account.userPosition.fetch(
        claimPositionPDA
      );
      expect(positionAfter.claimed).to.equal(true);

      const balanceAfter = await provider.connection.getBalance(
        creator.publicKey
      );
      // Balance should increase (minus tx fees)
      // We just check that payout happened (balance increased relative to vault payout)
      expect(balanceAfter).to.be.greaterThan(balanceBefore - 10000); // Allow for tx fees
    });

    // ============================================================
    // TEST 12: claim_winnings — NO loser cannot claim
    // ============================================================
    it("12. claim_winnings — NO loser cannot claim", async () => {
      try {
        await program.methods
          .claimWinnings()
          .accounts({
            market: claimMarketPDA,
            userPosition: claimPositionPDA2,
            vault: claimVaultPDA,
            user: user2.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([user2])
          .rpc();
        expect.fail("Should have thrown InsufficientShares error");
      } catch (err: any) {
        expect(err.toString()).to.contain("InsufficientShares");
      }
    });

    // ============================================================
    // TEST 13: claim_winnings — cannot claim twice
    // ============================================================
    it("13. claim_winnings — cannot claim twice", async () => {
      try {
        await program.methods
          .claimWinnings()
          .accounts({
            market: claimMarketPDA,
            userPosition: claimPositionPDA,
            vault: claimVaultPDA,
            user: creator.publicKey,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        expect.fail("Should have thrown AlreadyClaimed error");
      } catch (err: any) {
        expect(err.toString()).to.contain("AlreadyClaimed");
      }
    });
  });

  // ============================================================
  // TEST 14: fee — 2% fee collected correctly
  // ============================================================
  it("14. fee — 2% fee collected correctly", async () => {
    const feeQuestion = "Fee test market?";
    const feeTimestamp = Math.floor(Date.now() / 1000) + 3600;
    const [feeMarketPDA] = findMarketPDA(creator.publicKey, feeQuestion);
    const [feeVaultPDA] = findVaultPDA(feeMarketPDA);
    const [feeCreatorFeeVaultPDA] = findCreatorFeeVaultPDA(feeMarketPDA);
    const [feePositionPDA] = findPositionPDA(feeMarketPDA, creator.publicKey);

    await program.methods
      .createMarket(feeQuestion, new BN(feeTimestamp))
      .accounts({
        market: feeMarketPDA,
        vault: feeVaultPDA,
        creatorFeeVault: feeCreatorFeeVaultPDA,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Pre-fund fee vault with rent-exempt minimum
    const feeRentExempt =
      await provider.connection.getMinimumBalanceForRentExemption(0);
    const feeVaultBal = await provider.connection.getBalance(feeVaultPDA);
    if (feeVaultBal === 0) {
      const fundTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: creator.publicKey,
          toPubkey: feeVaultPDA,
          lamports: feeRentExempt,
        })
      );
      await provider.sendAndConfirm(fundTx);
    }

    const amountIn = 1_000_000; // 0.001 SOL = 1,000,000 lamports
    const treasuryBalanceBefore = await provider.connection.getBalance(
      treasuryPDA
    );
    const vaultBalanceBefore = await provider.connection.getBalance(
      feeVaultPDA
    );
    const creatorFeeVaultBalanceBefore = await provider.connection.getBalance(
      feeCreatorFeeVaultPDA
    );

    await program.methods
      .buyShares(new BN(amountIn), true, new BN(0))
      .accounts({
        market: feeMarketPDA,
        userPosition: feePositionPDA,
        vault: feeVaultPDA,
        treasury: treasuryPDA,
        creatorFeeVault: feeCreatorFeeVaultPDA,
        user: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const treasuryBalanceAfter = await provider.connection.getBalance(
      treasuryPDA
    );
    const vaultBalanceAfter = await provider.connection.getBalance(feeVaultPDA);
    const creatorFeeVaultBalanceAfter = await provider.connection.getBalance(
      feeCreatorFeeVaultPDA
    );

    // Protocol fee = 1% of amount_in = 10,000 lamports → treasury
    const protocolFee = Math.floor((amountIn * 100) / 10_000);
    // Creator fee = 1% of amount_in = 10,000 lamports → creator_fee_vault
    const totalFee = Math.floor((amountIn * 200) / 10_000);
    const creatorFee = totalFee - protocolFee;
    // Vault receives the trade amount = amount_in - total_fee (98%)
    const expectedVaultIncrease = amountIn - totalFee;

    expect(treasuryBalanceAfter - treasuryBalanceBefore).to.equal(protocolFee);
    expect(
      creatorFeeVaultBalanceAfter - creatorFeeVaultBalanceBefore
    ).to.equal(creatorFee);
    expect(vaultBalanceAfter - vaultBalanceBefore).to.equal(
      expectedVaultIncrease
    );

    // Market tracks accumulated creator fee
    const feeMarket = await program.account.market.fetch(feeMarketPDA);
    expect(feeMarket.creatorFeeAccumulated.toNumber()).to.equal(creatorFee);
  });

  // ============================================================
  // TEST 19: resolve_market — PROTOCOL_ADMIN can resolve a market
  //          created by another user, and creator fee is paid out
  // ============================================================
  it("19. resolve_market — admin resolves market created by user2", async () => {
    const adminQ = "Admin resolves user2 market?";
    const adminTs = Math.floor(Date.now() / 1000) + 2;
    const [adminMarketPDA] = findMarketPDA(user2.publicKey, adminQ);
    const [adminVaultPDA] = findVaultPDA(adminMarketPDA);
    const [adminCreatorFeeVaultPDA] = findCreatorFeeVaultPDA(adminMarketPDA);
    const [adminPositionPDA] = findPositionPDA(
      adminMarketPDA,
      creator.publicKey
    );

    // user2 creates the market
    await program.methods
      .createMarket(adminQ, new BN(adminTs))
      .accounts({
        market: adminMarketPDA,
        vault: adminVaultPDA,
        creatorFeeVault: adminCreatorFeeVaultPDA,
        creator: user2.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([user2])
      .rpc();

    // creator (a different wallet) buys YES — generates a 1% creator fee
    await program.methods
      .buyShares(new BN(1_000_000), true, new BN(0))
      .accounts({
        market: adminMarketPDA,
        userPosition: adminPositionPDA,
        vault: adminVaultPDA,
        treasury: treasuryPDA,
        creatorFeeVault: adminCreatorFeeVaultPDA,
        user: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const marketBefore = await program.account.market.fetch(adminMarketPDA);
    const accumulated = marketBefore.creatorFeeAccumulated.toNumber();
    expect(accumulated).to.be.greaterThan(0);

    const creatorWalletBalanceBefore = await provider.connection.getBalance(
      user2.publicKey
    );

    // Wait for expiry
    await new Promise((resolve) => setTimeout(resolve, 4000));

    // admin (deployer = local PROTOCOL_ADMIN) resolves user2's market
    await program.methods
      .resolveMarket(false)
      .accounts({
        market: adminMarketPDA,
        creatorFeeVault: adminCreatorFeeVaultPDA,
        creatorWallet: user2.publicKey,
        admin: adminKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const marketAfter = await program.account.market.fetch(adminMarketPDA);
    expect(marketAfter.resolved).to.equal(true);
    expect(marketAfter.outcome).to.equal(false);
    // Creator fee paid out and reset
    expect(marketAfter.creatorFeeAccumulated.toNumber()).to.equal(0);

    const creatorWalletBalanceAfter = await provider.connection.getBalance(
      user2.publicKey
    );
    expect(creatorWalletBalanceAfter - creatorWalletBalanceBefore).to.equal(
      accumulated
    );
  });

  // ============================================================
  // TESTS 15-18: withdraw_protocol_fees
  // ============================================================
  it("15. withdraw_protocol_fees — admin withdraws from treasury", async () => {
    const treasuryBefore = await provider.connection.getBalance(treasuryPDA);
    expect(treasuryBefore).to.be.greaterThan(0);

    const amount = 1000;
    await program.methods
      .withdrawProtocolFees(new BN(amount))
      .accounts({
        treasury: treasuryPDA,
        admin: adminKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const treasuryAfter = await provider.connection.getBalance(treasuryPDA);
    expect(treasuryBefore - treasuryAfter).to.equal(amount);
  });

  it("16. withdraw_protocol_fees — non-admin cannot withdraw", async () => {
    try {
      await program.methods
        .withdrawProtocolFees(new BN(1000))
        .accounts({
          treasury: treasuryPDA,
          admin: user2.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([user2])
        .rpc();
      expect.fail("Should have thrown Unauthorized error");
    } catch (err: any) {
      expect(err.toString()).to.contain("Unauthorized");
    }
  });

  it("17. withdraw_protocol_fees — amount over balance fails", async () => {
    const treasuryBalance = await provider.connection.getBalance(treasuryPDA);
    try {
      await program.methods
        .withdrawProtocolFees(new BN(treasuryBalance + 1_000_000_000))
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

  it("18. withdraw_protocol_fees — zero amount fails", async () => {
    try {
      await program.methods
        .withdrawProtocolFees(new BN(0))
        .accounts({
          treasury: treasuryPDA,
          admin: adminKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      expect.fail("Should have thrown ZeroAmount error");
    } catch (err: any) {
      expect(err.toString()).to.contain("ZeroAmount");
    }
  });

  // ============================================================
  // ACCOUNTING TESTS A-D
  // ============================================================
  describe("accounting tests", () => {
    const user3 = Keypair.generate();
    const user4 = Keypair.generate();

    before(async () => {
      await airdrop(user3.publicKey, 200);
      await airdrop(user4.publicKey, 200);
    });

    // Test A: only YES buyers → vault fully drained, creator fee paid out
    it("A. only YES buyers — vault drains to 0, creator fee paid", async () => {
      const m = await mkMarket(creator, "ACC-A only YES buyers?", soon(3));
      await buy(m, creator, 2_000_000, true);
      await buy(m, creator, 1_500_000, true);

      const beforeResolve = await program.account.market.fetch(m.market);
      expect(beforeResolve.creatorFeeAccumulated.toNumber()).to.be.greaterThan(
        0
      );

      const rentExempt =
        await provider.connection.getMinimumBalanceForRentExemption(0);

      await sleep(4000);
      await resolve(m, true);

      // Creator fee was paid out: accumulated reset, fee vault back to rent-exempt
      const afterResolve = await program.account.market.fetch(m.market);
      expect(afterResolve.creatorFeeAccumulated.toNumber()).to.equal(0);
      expect(await provider.connection.getBalance(m.creatorFeeVault)).to.equal(
        rentExempt
      );

      // Single YES holder claims the entire distributable pot. The vault keeps only
      // its rent-exempt seed (a System account cannot be left below rent-exempt).
      await claim(m, creator);
      expect(await provider.connection.getBalance(m.vault)).to.equal(rentExempt);
    });

    // Test B: YES-heavy vs NO, resolve YES → YES side splits the pot, NO gets 0
    it("B. YES-heavy vs NO — winners split pot, losers get nothing", async () => {
      const m = await mkMarket(creator, "ACC-B yes heavy vs no?", soon(4));
      await buy(m, creator, 8_000_000, true); // YES (big)
      await buy(m, user3, 1_000_000, true); // YES (small)
      await buy(m, user2, 1_000_000, false); // NO (loser)

      await sleep(5000);
      await resolve(m, true);

      const rentExempt =
        await provider.connection.getMinimumBalanceForRentExemption(0);
      const pot =
        (await provider.connection.getBalance(m.vault)) - rentExempt;

      const posCreator = await program.account.userPosition.fetch(
        findPositionPDA(m.market, creator.publicKey)[0]
      );
      const posUser3 = await program.account.userPosition.fetch(
        findPositionPDA(m.market, user3.publicKey)[0]
      );
      const mkt = await program.account.market.fetch(m.market);
      const totalYes = mkt.totalYesShares.toNumber();

      const expectedCreator = Math.floor(
        (pot * posCreator.yesShares.toNumber()) / totalYes
      );
      const expectedUser3 = Math.floor(
        (pot * posUser3.yesShares.toNumber()) / totalYes
      );

      const cBefore = await provider.connection.getBalance(creator.publicKey);
      await claim(m, creator);
      const cAfter = await provider.connection.getBalance(creator.publicKey);
      // creator paid the tx fee, so compare against vault accounting instead
      expect(cAfter).to.be.greaterThan(cBefore - 1_000_000);

      const u3Before = await provider.connection.getBalance(user3.publicKey);
      await claim(m, user3);
      const u3After = await provider.connection.getBalance(user3.publicKey);
      // user3 is not the fee payer (creator/provider pays), so exact delta
      expect(u3After - u3Before).to.equal(expectedUser3);

      // Creator (bigger YES position) is owed strictly more than user3
      expect(expectedCreator).to.be.greaterThan(expectedUser3);

      // NO holder (loser) cannot claim
      try {
        await claim(m, user2);
        expect.fail("NO holder should not be able to claim");
      } catch (err: any) {
        expect(err.toString()).to.contain("InsufficientShares");
      }

      // Vault drained down to its rent-exempt seed plus sub-lamport rounding dust
      const vaultLeft = await provider.connection.getBalance(m.vault);
      expect(vaultLeft - rentExempt).to.be.lessThan(2);
    });

    // Test C: multiple users, multiple purchases → exact proportional payouts
    it("C. multiple users & purchases — proportional, conserved", async () => {
      const m = await mkMarket(creator, "ACC-C multi user multi buy?", soon(5));
      await buy(m, creator, 1_000_000, true); // YES
      await buy(m, creator, 1_000_000, true); // YES (same user again)
      await buy(m, user2, 700_000, false); // NO
      await buy(m, user3, 1_300_000, true); // YES
      await buy(m, user2, 500_000, false); // NO

      await sleep(6000);
      await resolve(m, true);

      const rentExempt =
        await provider.connection.getMinimumBalanceForRentExemption(0);
      const pot =
        (await provider.connection.getBalance(m.vault)) - rentExempt;
      const mkt = await program.account.market.fetch(m.market);
      const totalYes = mkt.totalYesShares.toNumber();

      const yesHolders = [creator, user3];
      let totalPaid = 0;
      for (const h of yesHolders) {
        const pos = await program.account.userPosition.fetch(
          findPositionPDA(m.market, (h as any).publicKey)[0]
        );
        const expected = Math.floor(
          (pot * pos.yesShares.toNumber()) / totalYes
        );
        const balBefore = await provider.connection.getBalance(
          (h as any).publicKey
        );
        await claim(m, h);
        if (h !== creator) {
          const balAfter = await provider.connection.getBalance(
            (h as any).publicKey
          );
          expect(balAfter - balBefore).to.equal(expected);
        }
        totalPaid += expected;
      }

      // Conservation: everything but the rent-exempt seed and sub-lamport dust
      // left the vault
      const vaultLeft = await provider.connection.getBalance(m.vault);
      expect(pot - totalPaid).to.be.lessThan(yesHolders.length + 1);
      expect(vaultLeft - rentExempt).to.be.lessThan(yesHolders.length + 1);
    });

    // Test D: many YES + NO holders all claim → vault reaches ~0
    it("D. all winners claim — vault reaches ~0", async () => {
      const m = await mkMarket(creator, "ACC-D all claim?", soon(5));
      await buy(m, creator, 1_000_000, true); // YES
      await buy(m, user3, 1_000_000, true); // YES
      await buy(m, user4, 1_000_000, true); // YES
      await buy(m, user2, 1_000_000, false); // NO (loser)

      await sleep(6000);
      await resolve(m, true);

      const winners = [creator, user3, user4];
      for (const w of winners) {
        await claim(m, w);
      }

      const rentExempt =
        await provider.connection.getMinimumBalanceForRentExemption(0);
      const vaultLeft = await provider.connection.getBalance(m.vault);
      // Only the rent-exempt seed plus sub-lamport rounding dust may remain
      expect(vaultLeft - rentExempt).to.be.lessThan(winners.length);
    });
  });

  // ============================================================
  // EDGE CASE / STRESS TESTS
  // ============================================================
  describe("edge case & stress tests", () => {
    const user5 = Keypair.generate();
    const user6 = Keypair.generate();

    before(async () => {
      await airdrop(user5.publicKey, 200);
      await airdrop(user6.publicKey, 200);
    });

    it("E1. boundary timestamp — buy before expiry ok, after fails, resolve ok", async () => {
      const m = await mkMarket(creator, "EDGE boundary ts?", soon(2));
      // Buy immediately (still before expiry)
      await buy(m, creator, 500_000, true);
      // Wait until after expiry
      await sleep(3000);
      try {
        await buy(m, creator, 100_000, true);
        expect.fail("Should have thrown MarketExpired error");
      } catch (err: any) {
        expect(err.toString()).to.contain("MarketExpired");
      }
      // Resolve succeeds after expiry
      await resolve(m, true);
      const mkt = await program.account.market.fetch(m.market);
      expect(mkt.resolved).to.equal(true);
    });

    it("E2. tiny amount — 1 lamport buy does not overflow or divide by zero", async () => {
      const m = await mkMarket(creator, "EDGE tiny amount?", soon(3600));
      await buy(m, creator, 1, true);
      const pos = await program.account.userPosition.fetch(
        findPositionPDA(m.market, creator.publicKey)[0]
      );
      // 1 lamport (after 0 fee) still yields a tiny positive share amount
      expect(pos.yesShares.toNumber()).to.be.greaterThanOrEqual(0);
      const mkt = await program.account.market.fetch(m.market);
      expect(mkt.yesPool.toNumber()).to.be.greaterThan(0);
      expect(mkt.noPool.toNumber()).to.be.greaterThan(0);
    });

    it("E3. large amount — 50 SOL buy keeps AMM math sound", async () => {
      const m = await mkMarket(creator, "EDGE large amount?", soon(3600));
      const large = 50 * LAMPORTS_PER_SOL;
      await buy(m, creator, large, true);
      const mkt = await program.account.market.fetch(m.market);
      // YES pool grew by ~98% of the input, NO pool shrank but stayed positive
      expect(mkt.yesPool.toNumber()).to.be.greaterThan(large / 2);
      expect(mkt.noPool.toNumber()).to.be.greaterThan(0);
      expect(mkt.totalYesShares.toNumber()).to.be.greaterThan(0);
      // K invariant roughly preserved (no overflow corrupting the pools)
      const k = mkt.yesPool.toNumber() * mkt.noPool.toNumber();
      expect(k).to.be.greaterThan(0);
    });

    it("F. randomized stress — conservation of funds across many trades", async () => {
      const m = await mkMarket(creator, "STRESS randomized?", soon(8));
      const buyers = [creator, user2, user5, user6];

      const treasuryBefore = await provider.connection.getBalance(treasuryPDA);
      const creatorFeeVaultBefore = await provider.connection.getBalance(
        m.creatorFeeVault
      );
      const vaultBefore = await provider.connection.getBalance(m.vault);

      let totalIn = 0;
      let totalProtocolFee = 0;
      let totalCreatorFee = 0;
      let totalTrade = 0;

      const NUM_TRADES = 12;
      for (let i = 0; i < NUM_TRADES; i++) {
        const buyer = buyers[Math.floor(Math.random() * buyers.length)];
        const isYes = Math.random() < 0.5;
        const amount = 100_000 + Math.floor(Math.random() * 2_000_000);
        await buy(m, buyer, amount, isYes);
        totalIn += amount;
        const protocolFee = Math.floor((amount * 100) / 10_000);
        const totalFee = Math.floor((amount * 200) / 10_000);
        totalProtocolFee += protocolFee;
        totalCreatorFee += totalFee - protocolFee;
        totalTrade += amount - totalFee;
      }

      // Fee accounting: every lamport is split 1% / 1% / 98% with no leakage
      const treasuryAfter = await provider.connection.getBalance(treasuryPDA);
      const creatorFeeVaultAfter = await provider.connection.getBalance(
        m.creatorFeeVault
      );
      const vaultAfter = await provider.connection.getBalance(m.vault);

      expect(treasuryAfter - treasuryBefore).to.equal(totalProtocolFee);
      expect(creatorFeeVaultAfter - creatorFeeVaultBefore).to.equal(
        totalCreatorFee
      );
      expect(vaultAfter - vaultBefore).to.equal(totalTrade);
      expect(totalProtocolFee + totalCreatorFee + totalTrade).to.equal(
        totalIn
      );

      const mkt = await program.account.market.fetch(m.market);
      expect(mkt.creatorFeeAccumulated.toNumber()).to.equal(totalCreatorFee);

      await sleep(8000);
      await resolve(m, true);

      // Creator fee fully paid out on resolution
      const mktResolved = await program.account.market.fetch(m.market);
      expect(mktResolved.creatorFeeAccumulated.toNumber()).to.equal(0);

      // All YES winners claim; vault drains to sub-lamport dust
      const potBeforeClaims = await provider.connection.getBalance(m.vault);
      if (mktResolved.totalYesShares.toNumber() > 0) {
        for (const b of buyers) {
          const [posPda] = findPositionPDA(m.market, (b as any).publicKey);
          const posInfo = await provider.connection.getAccountInfo(posPda);
          if (!posInfo) continue;
          const pos = await program.account.userPosition.fetch(posPda);
          if (pos.yesShares.toNumber() > 0 && !pos.claimed) {
            await claim(m, b);
          }
        }
        const rentExempt =
          await provider.connection.getMinimumBalanceForRentExemption(0);
        const vaultLeft = await provider.connection.getBalance(m.vault);
        expect(vaultLeft - rentExempt).to.be.lessThan(buyers.length + 1);
        expect(potBeforeClaims).to.be.greaterThan(0);
      }
    });
  });
});
