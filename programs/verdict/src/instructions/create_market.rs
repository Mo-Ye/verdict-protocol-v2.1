use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::Market;
use crate::errors::VerdictError;

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

    let initial_liquidity = INITIAL_POOL_SIZE
        .checked_mul(2)
        .ok_or(VerdictError::Overflow)?;

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
    market.initial_pool_size = initial_liquidity;
    market.vault_bump = ctx.bumps.vault;
    market.creator_fee_vault_bump = ctx.bumps.creator_fee_vault;
    market.bump = ctx.bumps.market;

    let rent_exempt = Rent::get()?.minimum_balance(0);

    // Fund vault with rent-exempt minimum PLUS initial pool liquidity.
    // This SOL backs the virtual AMM pools and is refunded to the creator on resolution.
    let vault_fund = rent_exempt
        .checked_add(initial_liquidity)
        .ok_or(VerdictError::Overflow)?;

    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.creator.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
            },
        ),
        vault_fund,
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