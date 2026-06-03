use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Market {
    /// The question this market is about
    #[max_len(200)]
    pub question: String,
    /// Unix timestamp when the market expires
    pub end_timestamp: i64,
    /// Current size of the YES pool (for AMM)
    pub yes_pool: u64,
    /// Current size of the NO pool (for AMM)
    pub no_pool: u64,
    /// Total YES shares issued to users
    pub total_yes_shares: u64,
    /// Total NO shares issued to users
    pub total_no_shares: u64,
    /// Whether the market has been resolved
    pub resolved: bool,
    /// The outcome: Some(true) = YES won, Some(false) = NO won, None = unresolved
    pub outcome: Option<bool>,
    /// The market creator's public key
    pub creator: Pubkey,
    /// Accumulated creator fee (1% of every trade) held in the creator fee vault,
    /// paid out to the creator automatically on resolution.
    pub creator_fee_accumulated: u64,
    /// Snapshot of the vault balance taken on the first claim after resolution.
    /// All winners are paid a fixed proportional share of this pot so the vault
    /// drains fully regardless of claim order. 0 means "not yet snapshotted".
    pub winning_pot: u64,
    /// Bump seed for the vault PDA
    pub vault_bump: u8,
    /// Bump seed for the creator fee vault PDA
    pub creator_fee_vault_bump: u8,
    /// Bump seed for this market PDA
    pub bump: u8,
}

impl Market {
    /// The constant product K = yes_pool * no_pool
    pub fn invariant(&self) -> u128 {
        (self.yes_pool as u128) * (self.no_pool as u128)
    }
}
