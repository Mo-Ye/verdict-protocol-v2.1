use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::Market;
use crate::errors::VerdictError;

#[cfg(not(feature = "local-admin"))]
pub const PROTOCOL_ADMIN: Pubkey = pubkey!("HxqWfGfbbQ4LCgZicrTdbzGMqffAARNfb4S1Rxvchxto");
#[cfg(feature = "local-admin")]
pub const PROTOCOL_ADMIN: Pubkey = pubkey!("4zLY3ctGsunFvBNPsFZKxDj7xRVwuG4Ni2U8kgEk7n99");

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    #[account(
        mut,
        constraint = !market.resolved @ VerdictError::MarketAlreadyResolved
    )]
    pub market: Account<'info, Market>,

    /// CHECK: This is a PDA used as a SOL vault, validated by seeds
    #[account(mut)]
    pub vault: SystemAccount<'info>,

    /// CHECK: This is a PDA used as a SOL vault, validated by seeds
    #[account(mut)]
    pub creator_fee_vault: SystemAccount<'info>,

    /// CHECK: validated to equal market.creator
    #[account(mut, address = market.creator)]
    pub creator_wallet: SystemAccount<'info>,

    pub admin: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn resolve_market_handler(
    ctx: Context<ResolveMarket>,
    outcome: bool,
) -> Result<()> {
    let market = &mut ctx.accounts.market;

    require!(
        ctx.accounts.admin.key() == market.creator
            || ctx.accounts.admin.key() == PROTOCOL_ADMIN,
        VerdictError::Unauthorized
    );
    require!(!market.resolved, VerdictError::MarketAlreadyResolved);
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= market.end_timestamp,
        VerdictError::MarketNotExpiredYet
    );

    market.resolved = true;
    market.outcome = Some(outcome);

    let market_key = market.key();
    let vault_bump = market.vault_bump;
    let creator_fee_vault_bump = market.creator_fee_vault_bump;

    // Refund initial pool liquidity to creator.
    // Creator funded the AMM pools at creation but is not a liquidity provider —
    // traders' SOL is the actual prize pool, creator deposit is returned in full.
    let initial_pool_size = market.initial_pool_size;
    if initial_pool_size > 0 {
        let vault_seeds: &[&[u8]] = &[
            b"vault",
            market_key.as_ref(),
            &[vault_bump],
        ];
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.creator_wallet.to_account_info(),
                },
                &[vault_seeds],
            ),
            initial_pool_size,
        )?;
    }

    // Pay out accumulated creator fee from creator_fee_vault.
    let creator_fee = market.creator_fee_accumulated;
    if creator_fee > 0 {
        let creator_fee_seeds: &[&[u8]] = &[
            b"creator_fee",
            market_key.as_ref(),
            &[creator_fee_vault_bump],
        ];
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.creator_fee_vault.to_account_info(),
                    to: ctx.accounts.creator_wallet.to_account_info(),
                },
                &[creator_fee_seeds],
            ),
            creator_fee,
        )?;
        market.creator_fee_accumulated = 0;
    }

    msg!(
        "Market resolved: {} — outcome: {} — initial pool refunded: {} — creator fee paid: {}",
        market.question,
        if outcome { "YES" } else { "NO" },
        initial_pool_size,
        creator_fee
    );

    Ok(())
}