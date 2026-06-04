use anchor_lang::prelude::*;

#[error_code]
pub enum VerdictError {
    #[msg("Question cannot be empty")]
    EmptyQuestion,
    #[msg("Question exceeds maximum length of 200 characters")]
    QuestionTooLong,
    #[msg("End timestamp must be in the future")]
    InvalidTimestamp,
    #[msg("Market has expired")]
    MarketExpired,
    #[msg("Market has not expired yet")]
    MarketNotExpiredYet,
    #[msg("Market has already been resolved")]
    MarketAlreadyResolved,
    #[msg("Market has not been resolved yet")]
    MarketNotResolved,
    #[msg("Insufficient shares to sell or claim")]
    InsufficientShares,
    #[msg("Winnings have already been claimed")]
    AlreadyClaimed,
    #[msg("Unauthorized: only admin can perform this action")]
    Unauthorized,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Insufficient treasury balance for withdrawal")]
    InsufficientTreasuryBalance,
    #[msg("Slippage exceeded: shares out below minimum")]
    SlippageExceeded,
}
