use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::Market;
use crate::errors::VerdictError;

/// Initial pool size in lamports (0.01 SOL per side).
/// For production with real money, increase to at least 100 SOL (100_000_000_000)
/// to prevent price manipulation on small trades.
const INITIAL_POOL_SIZE: u64 = 10_000_000;

#[derive(Accounts)]
#[instruction(question: String)]
pub struct CreateMarket<'info> {
    #[account(
        init,
        payer = creator,
        space = 8 + Market::INIT_SPACE,
        seeds = [
            b"market",
            creator.key().as_ref(),
            &anchor_lang::solana_program::hash::hash(question.as_bytes()).to_bytes()[..32],
        ],
        bump
    )]
    pub market: Account<'info, Market>,
    /// CHECK: This is a PDA used as a SOL vault, validated by seeds
    #[account(
        mut,
        seeds = [b"vault", market.key().as_ref()],
        bump
    )]
    pub vault: SystemAccount<'info>,
    /// The creator fee vault PDA — holds the 1% creator fee separately from trade liquidity.
    /// CHECK: This is a PDA used as a SOL vault, validated by seeds
    #[account(
        mut,
        seeds = [b"creator_fee", market.key().as_ref()],
        bump
    )]
    pub creator_fee_vault: SystemAccount<'info>,
    #[account(mut)]
    pub creator: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub fn create_market_handler(
    ctx: Context<CreateMarket>,
    question: String,
    end_timestamp: i64,
) -> Result<()> {
    require!(!question.is_empty(), VerdictError::EmptyQuestion);
    require!(question.len() <= 200, VerdictError::QuestionTooLong);
    let clock = Clock::get()?;
    require!(end_timestamp > clock.unix_timestamp, VerdictError::InvalidTimestamp);
    let market = &mut ctx.accounts.market;
    market.question = question;
    market.end_timestamp = end_timestamp;
    market.yes_pool = INITIAL_POOL_SIZE;
    market.no_pool = INITIAL_POOL_SIZE;
    market.total_yes_shares = 0;
    market.total_no_shares = 0;
    market.resolved = false;
    market.outcome = None;
    market.creator = ctx.accounts.creator.key();
    market.creator_fee_accumulated = 0;
    market.winning_pot = 0;
    market.vault_bump = ctx.bumps.vault;
    market.creator_fee_vault_bump = ctx.bumps.creator_fee_vault;
    market.bump = ctx.bumps.market;

    // Auto-fund the vault and creator fee vault with the rent-exempt minimum so the
    // first buy_shares / fee transfer never fails on a non-rent-exempt destination.
    let rent_exempt = Rent::get()?.minimum_balance(0);
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        rent_exempt,
    )?;
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.creator_fee_vault.to_account_info(),
            },
        ),
        rent_exempt,
    )?;

    msg!("Market created: {}", market.question);
    Ok(())
}