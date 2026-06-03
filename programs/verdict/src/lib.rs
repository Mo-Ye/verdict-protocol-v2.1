use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("Aid5RQWA6UXXTKqSpStHA9CuncyU2ipSjhYAvfsLhk4L");

#[program]
pub mod verdict {
    use super::*;

    /// Creates a new prediction market with a question and expiry time.
    /// Initializes the AMM with equal YES/NO pools for 50/50 starting odds.
    pub fn create_market(
        ctx: Context<CreateMarket>,
        question: String,
        end_timestamp: i64,
    ) -> Result<()> {
        create_market_handler(ctx, question, end_timestamp)
    }

    /// Buys YES or NO shares using SOL via a constant product AMM.
    /// Takes a 2% fee — 1% to protocol treasury, 1% stays as creator fee.
    pub fn buy_shares(
        ctx: Context<BuyShares>,
        amount_in: u64,
        is_yes: bool,
    ) -> Result<()> {
        buy_shares_handler(ctx, amount_in, is_yes)
    }

    /// Resolves a market after expiry. Only callable by the market creator
    /// or the protocol admin. Sets the outcome to YES (true) or NO (false).
    pub fn resolve_market(
        ctx: Context<ResolveMarket>,
        outcome: bool,
    ) -> Result<()> {
        resolve_market_handler(ctx, outcome)
    }

    /// Claims winnings for a user who holds winning shares.
    /// Pays out proportional share of the vault balance.
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        claim_winnings_handler(ctx)
    }

    /// Withdraws accumulated protocol fees from the treasury to the protocol admin.
    /// Only callable by the hardcoded PROTOCOL_ADMIN.
    pub fn withdraw_protocol_fees(
        ctx: Context<WithdrawProtocolFees>,
        amount: u64,
    ) -> Result<()> {
        withdraw_protocol_fees_handler(ctx, amount)
    }
}
