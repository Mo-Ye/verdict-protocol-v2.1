use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{Market, UserPosition};
use crate::errors::VerdictError;

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
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
        mut,
        seeds = [b"position", market.key().as_ref(), user.key().as_ref()],
        bump = user_position.bump,
        has_one = user,
        has_one = market,
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

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn claim_winnings_handler(ctx: Context<ClaimWinnings>) -> Result<()> {
    let market = &ctx.accounts.market;
    let position = &ctx.accounts.user_position;

    // Validate: market must be resolved
    require!(market.resolved, VerdictError::MarketNotResolved);

    // Validate: not already claimed
    require!(!position.claimed, VerdictError::AlreadyClaimed);

    // Determine if user is a winner and calculate payout
    let outcome = market.outcome.unwrap(); // Safe because market.resolved is true

    let (user_shares, total_shares) = if outcome {
        // YES won
        (position.yes_shares, market.total_yes_shares)
    } else {
        // NO won
        (position.no_shares, market.total_no_shares)
    };

    // User must have winning shares
    require!(user_shares > 0, VerdictError::InsufficientShares);

    // Calculate payout using a FIXED pot snapshot so the distribution is independent
    // of claim order. The snapshot is taken on the first claim: at that point no winner
    // has been paid yet and no further deposits are possible (buys are rejected once
    // resolved), so the live vault balance equals the total distributable pot.
    //
    // We exclude the vault's rent-exempt seed (auto-funded in create_market) from the
    // distributable pot. A System-owned account cannot be left with a non-zero balance
    // below the rent-exempt minimum, so keeping the seed in the vault guarantees every
    // claim — including the last one — leaves the vault rent-valid (>= rent-exempt).
    let rent_exempt = Rent::get()?.minimum_balance(0);
    let market_mut = &mut ctx.accounts.market;
    if market_mut.winning_pot == 0 {
        let vault_balance = ctx.accounts.vault.lamports();
        market_mut.winning_pot = vault_balance.saturating_sub(rent_exempt);
    }
    let pot = market_mut.winning_pot;

    let payout = (pot as u128)
        .checked_mul(user_shares as u128)
        .ok_or(VerdictError::Overflow)?
        .checked_div(total_shares as u128)
        .ok_or(VerdictError::Overflow)? as u64;

    // Transfer SOL from vault PDA to user using invoke_signed
    // The vault is a system-owned PDA, so we use system_program::transfer with signer seeds
    let market_key = market_mut.key();
    let vault_bump = market_mut.vault_bump;
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
                to: ctx.accounts.user.to_account_info(),
            },
            &[vault_seeds],
        ),
        payout,
    )?;

    // Mark position as claimed
    let position = &mut ctx.accounts.user_position;
    position.claimed = true;

    msg!(
        "Claimed {} lamports for {} winning shares",
        payout,
        user_shares
    );

    Ok(())
}
