use crate::errors::VerdictError;
use crate::instructions::resolve_market::PROTOCOL_ADMIN;
use anchor_lang::prelude::*;
use anchor_lang::system_program;

#[derive(Accounts)]
pub struct WithdrawProtocolFees<'info> {
    /// The treasury PDA that holds accumulated protocol fees
    /// CHECK: This is a PDA used as a SOL treasury, validated by seeds
    #[account(
        mut,
        seeds = [b"treasury"],
        bump
    )]
    pub treasury: SystemAccount<'info>,

    /// The protocol admin — must match the hardcoded PROTOCOL_ADMIN.
    #[account(mut)]
    pub admin: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn withdraw_protocol_fees_handler(
    ctx: Context<WithdrawProtocolFees>,
    amount: u64,
) -> Result<()> {
    // Only the protocol admin may withdraw treasury funds.
    require!(
        ctx.accounts.admin.key() == PROTOCOL_ADMIN,
        VerdictError::Unauthorized
    );
    require!(amount > 0, VerdictError::ZeroAmount);

    // Cannot withdraw so much that the treasury drops below rent-exempt minimum.
    // Without this guard the admin could drain all lamports, making the PDA
    // non-rent-exempt and causing future fee deposits to fail.
    let treasury_balance = ctx.accounts.treasury.lamports();
    let rent_exempt = Rent::get()?.minimum_balance(0);
    let withdrawable = treasury_balance.saturating_sub(rent_exempt);
    require!(
        amount <= withdrawable,
        VerdictError::InsufficientTreasuryBalance
    );
    require!(
        treasury_balance.checked_sub(amount).unwrap_or(0) >= rent_exempt,
        VerdictError::TreasuryRentExempt
    );

    let treasury_bump = ctx.bumps.treasury;
    let signer_seeds: &[&[u8]] = &[b"treasury", &[treasury_bump]];

    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.treasury.to_account_info(),
                to: ctx.accounts.admin.to_account_info(),
            },
            &[signer_seeds],
        ),
        amount,
    )?;

    msg!("Protocol fees withdrawn: {} lamports", amount);

    Ok(())
}
