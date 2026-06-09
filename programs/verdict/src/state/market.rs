use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Market {
    #[max_len(200)]
    pub question: String,
    pub end_timestamp: i64,
    pub yes_pool: u64,
    pub no_pool: u64,
    pub total_yes_shares: u64,
    pub total_no_shares: u64,
    pub resolved: bool,
    pub outcome: Option<bool>,
    pub creator: Pubkey,
    pub creator_fee_accumulated: u64,
    pub winning_pot: u64,
    /// Total initial liquidity deposited by creator on market creation.
    /// Refunded to the creator on resolution — creator is not a liquidity provider.
    pub initial_pool_size: u64,
    pub vault_bump: u8,
    pub creator_fee_vault_bump: u8,
    pub bump: u8,
}

impl Market {
    pub fn invariant(&self) -> u128 {
        (self.yes_pool as u128) * (self.no_pool as u128)
    }
}