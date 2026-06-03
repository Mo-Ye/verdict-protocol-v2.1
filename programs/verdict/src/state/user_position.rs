use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct UserPosition {
    /// The user who owns this position
    pub user: Pubkey,
    /// The market this position is for
    pub market: Pubkey,
    /// Number of YES shares held
    pub yes_shares: u64,
    /// Number of NO shares held
    pub no_shares: u64,
    /// Whether winnings have been claimed
    pub claimed: bool,
    /// Bump seed for this PDA
    pub bump: u8,
}
