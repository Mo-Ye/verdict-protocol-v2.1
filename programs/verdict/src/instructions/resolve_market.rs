use crate::errors::VerdictError;
use crate::state::Market;
use anchor_lang::prelude::*;

/// Hardcoded protocol admin pubkey. The market creator OR this admin may resolve a market.
#[cfg(not(feature = "local-admin"))]
pub const PROTOCOL_ADMIN: Pubkey = pubkey!("EBBkuBxBRsctjb8RdPSPMCfZvn217bqPkg45VDUdic6T");
/// Test-only admin — a throwaway keypair committed at `tests/fixtures/admin.json`,
/// enabled via the `local-admin` feature. Never used in production builds.
#[cfg(feature = "local-admin")]
pub const PROTOCOL_ADMIN: Pubkey = pubkey!("4zLY3ctGsunFvBNPsFZKxDj7xRVwuG4Ni2U8kgEk7n99");

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    #[account(
        mut,
        seeds = [
            b"market",
            market.creator.as_ref(),
            &anchor_lang::solana_program::hash::hash(market.question.as_bytes()).to_bytes()[..32],
        ],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    /// The creator fee vault PDA — its accumulated balance is paid out to the creator here.
    /// CHECK: This is a PDA used as a SOL vault, validated by seeds
    #[account(
        mut,
        seeds = [b"creator_fee", market.key().as_ref()],
        bump = market.creator_fee_vault_bump
    )]
    pub creator_fee_vault: SystemAccount<'info>,

    /// The market creator's wallet — receives the accumulated creator fee on resolution.
    /// CHECK: validated to equal market.creator
    #[account(mut, address = market.creator)]
    pub creator_wallet: SystemAccount<'info>,

    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn resolve_market_handler(ctx: Context<ResolveMarket>, outcome: bool) -> Result<()> {
    let market = &mut ctx.accounts.market;

    // Validate: only the market creator or the protocol admin can resolve
    require!(
        ctx.accounts.admin.key() == market.creator || ctx.accounts.admin.key() == PROTOCOL_ADMIN,
        VerdictError::Unauthorized
    );

    // Validate: market must not be already resolved
    require!(!market.resolved, VerdictError::MarketAlreadyResolved);

    // Validate: market must have expired (end_timestamp must have passed)
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= market.end_timestamp,
        VerdictError::MarketNotExpiredYet
    );

    market.resolved = true;
    market.outcome = Some(outcome);

    // Automatically pay out the accumulated creator fee to the creator's wallet.
    // Uses direct lamport transfer instead of CPI — the system_program::transfer
    // CPI approach fails in production builds (non-local-admin) for system-owned
    // PDA vaults.
    let creator_fee = market.creator_fee_accumulated;
    if creator_fee > 0 {
        **ctx
            .accounts
            .creator_fee_vault
            .to_account_info()
            .try_borrow_mut_lamports()? -= creator_fee;
        **ctx
            .accounts
            .creator_wallet
            .to_account_info()
            .try_borrow_mut_lamports()? += creator_fee;

        market.creator_fee_accumulated = 0;
    }

    msg!(
        "Market resolved: {} — outcome: {} — creator fee paid: {}",
        market.question,
        if outcome { "YES" } else { "NO" },
        creator_fee
    );

    Ok(())
}
