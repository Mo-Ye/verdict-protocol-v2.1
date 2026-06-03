use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{Market, UserPosition};
use crate::errors::VerdictError;

/// Fee percentage in basis points (200 = 2%)
const FEE_BPS: u64 = 200;
/// Protocol's share of fees in basis points (100 = 1%)
const PROTOCOL_FEE_BPS: u64 = 100;

#[derive(Accounts)]
pub struct BuyShares<'info> {
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

    #[account(
        init_if_needed,
        payer = user,
        space = 8 + UserPosition::INIT_SPACE,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub user_position: Account<'info, UserPosition>,

    /// The vault PDA that holds SOL for this market
    /// CHECK: This is a PDA used as a SOL vault, validated by seeds
    #[account(
        mut,
        seeds = [b"vault", market.key().as_ref()],
        bump = market.vault_bump
    )]
    pub vault: SystemAccount<'info>,

    /// The treasury PDA that collects protocol fees
    /// CHECK: This is a PDA used as a SOL treasury, validated by seeds
    #[account(
        mut,
        seeds = [b"treasury"],
        bump
    )]
    pub treasury: SystemAccount<'info>,

    /// The creator fee vault PDA that collects the 1% creator fee
    /// CHECK: This is a PDA used as a SOL vault, validated by seeds
    #[account(
        mut,
        seeds = [b"creator_fee", market.key().as_ref()],
        bump = market.creator_fee_vault_bump
    )]
    pub creator_fee_vault: SystemAccount<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn buy_shares_handler(
    ctx: Context<BuyShares>,
    amount_in: u64,
    is_yes: bool,
    min_shares_out: u64,
) -> Result<()> {
    let market = &ctx.accounts.market;

    // Validate market state
    require!(!market.resolved, VerdictError::MarketAlreadyResolved);
    let clock = Clock::get()?;
    require!(clock.unix_timestamp < market.end_timestamp, VerdictError::MarketExpired);
    require!(amount_in > 0, VerdictError::ZeroAmount);

    // Calculate fees:
    // Total fee = 2% of amount_in, split into 1% protocol + 1% creator.
    // The remaining 98% (amount_after_fee) is the trade amount that enters the vault
    // and drives the AMM.
    let total_fee = amount_in
        .checked_mul(FEE_BPS)
        .ok_or(VerdictError::Overflow)?
        / 10_000;
    let protocol_fee = amount_in
        .checked_mul(PROTOCOL_FEE_BPS)
        .ok_or(VerdictError::Overflow)?
        / 10_000;
    // Creator fee is whatever remains of the total fee after the protocol cut (1%).
    let creator_fee = total_fee
        .checked_sub(protocol_fee)
        .ok_or(VerdictError::Overflow)?;
    let amount_after_fee = amount_in
        .checked_sub(total_fee)
        .ok_or(VerdictError::Overflow)?;

    // Transfer protocol fee (1%) to treasury
    if protocol_fee > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.treasury.to_account_info(),
                },
            ),
            protocol_fee,
        )?;
    }

    // Transfer creator fee (1%) to the separate creator fee vault
    if creator_fee > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.user.to_account_info(),
                    to: ctx.accounts.creator_fee_vault.to_account_info(),
                },
            ),
            creator_fee,
        )?;
    }

    // Transfer the trade amount (98%, after both fees) to the vault
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        amount_after_fee,
    )?;

    // Constant Product AMM (CPMM) calculation:
    // K = yes_pool * no_pool (invariant, stays constant)
    // When buying YES:
    //   new_yes_pool = yes_pool + amount_after_fee
    //   new_no_pool = K / new_yes_pool
    //   shares_out = no_pool - new_no_pool (the shrinkage of the opposite pool)
    // When buying NO: same logic but reversed.

    let market = &mut ctx.accounts.market;
    let k = market.invariant();

    // Track the creator fee that now lives in the creator fee vault.
    market.creator_fee_accumulated = market
        .creator_fee_accumulated
        .checked_add(creator_fee)
        .ok_or(VerdictError::Overflow)?;

    let shares_out = if is_yes {
        // Buying YES shares: add liquidity to YES pool, get shares from NO pool shrinkage
        let new_yes_pool = (market.yes_pool as u128)
            .checked_add(amount_after_fee as u128)
            .ok_or(VerdictError::Overflow)?;
        let new_no_pool = k
            .checked_div(new_yes_pool)
            .ok_or(VerdictError::Overflow)?;
        let shares = (market.no_pool as u128)
            .checked_sub(new_no_pool)
            .ok_or(VerdictError::Overflow)?;

        market.yes_pool = new_yes_pool as u64;
        market.no_pool = new_no_pool as u64;
        market.total_yes_shares = market.total_yes_shares
            .checked_add(shares as u64)
            .ok_or(VerdictError::Overflow)?;

        shares as u64
    } else {
        // Buying NO shares: add liquidity to NO pool, get shares from YES pool shrinkage
        let new_no_pool = (market.no_pool as u128)
            .checked_add(amount_after_fee as u128)
            .ok_or(VerdictError::Overflow)?;
        let new_yes_pool = k
            .checked_div(new_no_pool)
            .ok_or(VerdictError::Overflow)?;
        let shares = (market.yes_pool as u128)
            .checked_sub(new_yes_pool)
            .ok_or(VerdictError::Overflow)?;

        market.no_pool = new_no_pool as u64;
        market.yes_pool = new_yes_pool as u64;
        market.total_no_shares = market.total_no_shares
            .checked_add(shares as u64)
            .ok_or(VerdictError::Overflow)?;

        shares as u64
    };

    // Slippage protection: revert if the trade yields fewer shares than the caller expects.
    if min_shares_out > 0 {
        require!(shares_out >= min_shares_out, VerdictError::SlippageExceeded);
    }

    // Update user position
    let position = &mut ctx.accounts.user_position;
    if position.user == Pubkey::default() {
        // First time — initialize fields
        position.user = ctx.accounts.user.key();
        position.market = market.key();
        position.claimed = false;
        position.bump = ctx.bumps.user_position;
    }

    if is_yes {
        position.yes_shares = position.yes_shares
            .checked_add(shares_out)
            .ok_or(VerdictError::Overflow)?;
    } else {
        position.no_shares = position.no_shares
            .checked_add(shares_out)
            .ok_or(VerdictError::Overflow)?;
    }

    msg!(
        "Bought {} {} shares for {} lamports (fee: {})",
        shares_out,
        if is_yes { "YES" } else { "NO" },
        amount_in,
        total_fee
    );

    Ok(())
}
