use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("C8s7AU4HCN6NNSU9XLWTaJECAqseX41AjTDyRpuJ9TFZ");

#[program]
pub mod verdict {
    use super::*;

    pub fn create_market(
        ctx: Context<CreateMarket>,
        question: String,
        end_timestamp: i64,
    ) -> Result<()> {
        create_market_handler(ctx, question, end_timestamp)
    }

    pub fn buy_shares(
        ctx: Context<BuyShares>,
        amount_in: u64,
        is_yes: bool,
    ) -> Result<()> {
        buy_shares_handler(ctx, amount_in, is_yes)
    }

    pub fn resolve_market(
        ctx: Context<ResolveMarket>,
        outcome: bool,
    ) -> Result<()> {
        resolve_market_handler(ctx, outcome)
    }

    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        claim_winnings_handler(ctx)
    }

    pub fn withdraw_protocol_fees(
        ctx: Context<WithdrawProtocolFees>,
        amount: u64,
    ) -> Result<()> {
        withdraw_protocol_fees_handler(ctx, amount)
    }
}
