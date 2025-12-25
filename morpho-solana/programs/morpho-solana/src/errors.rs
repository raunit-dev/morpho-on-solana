use anchor_lang::prelude::*;

#[error_code]
pub enum MorphoError {
    // === Authorization Errors (6000-6009) ===
    #[msg("Caller is not authorized to perform this action")]
    Unauthorized = 6000,

    #[msg("Invalid owner for this operation")]
    InvalidOwner = 6001,

    #[msg("Authorization has expired")]
    AuthorizationExpired = 6002,

    #[msg("Authorization has been revoked")]
    AuthorizationRevoked = 6003,

    // === Input Validation Errors (6010-6029) ===
    #[msg("Amount must be greater than zero")]
    ZeroAmount = 6010,

    #[msg("Cannot specify both assets and shares")]
    InvalidInput = 6011,

    #[msg("Slippage tolerance exceeded")]
    SlippageExceeded = 6012,

    #[msg("Invalid LLTV value (must be 0 < lltv <= 10000)")]
    InvalidLltv = 6013,

    #[msg("Fee exceeds maximum allowed (25%)")]
    FeeTooHigh = 6014,

    #[msg("Invalid mint address")]
    InvalidMint = 6015,

    #[msg("Invalid oracle address")]
    InvalidOracle = 6016,

    #[msg("Invalid IRM address")]
    InvalidIrm = 6017,

    #[msg("Invalid market ID")]
    InvalidMarketId = 6018,

    // === Market Errors (6030-6049) ===
    #[msg("Market already exists")]
    MarketExists = 6030,

    #[msg("Market does not exist")]
    MarketNotFound = 6031,

    #[msg("LLTV is not enabled")]
    LltvNotEnabled = 6032,

    #[msg("IRM is not enabled")]
    IrmNotEnabled = 6033,

    #[msg("Parameter already enabled")]
    AlreadyEnabled = 6034,

    #[msg("Maximum LLTVs reached")]
    MaxLltvsReached = 6035,

    #[msg("Maximum IRMs reached")]
    MaxIrmsReached = 6036,

    // === Balance Errors (6050-6069) ===
    #[msg("Insufficient supply balance")]
    InsufficientBalance = 6050,

    #[msg("Insufficient collateral")]
    InsufficientCollateral = 6051,

    #[msg("Insufficient market liquidity")]
    InsufficientLiquidity = 6052,

    // === Health Errors (6070-6079) ===
    #[msg("Position would become unhealthy")]
    PositionUnhealthy = 6070,

    #[msg("Position is healthy, cannot liquidate")]
    PositionHealthy = 6071,

    #[msg("Position is not empty, cannot close")]
    PositionNotEmpty = 6072,

    // === Pause Errors (6080-6089) ===
    #[msg("Protocol is paused")]
    ProtocolPaused = 6080,

    #[msg("Market is paused")]
    MarketPaused = 6081,

    // === Oracle Errors (6090-6109) ===
    #[msg("Oracle price is stale")]
    OracleStale = 6090,

    #[msg("Oracle returned invalid price")]
    OracleInvalidPrice = 6091,

    #[msg("Oracle error")]
    OracleError = 6092,

    #[msg("Oracle returned no data")]
    OracleNoReturnData = 6093,

    #[msg("Oracle return data from unexpected program")]
    OracleInvalidProgram = 6094,

    #[msg("Oracle return data malformed")]
    OracleInvalidReturnData = 6095,

    #[msg("Oracle price exceeds maximum")]
    OraclePriceTooHigh = 6096,

    #[msg("Oracle price below minimum")]
    OraclePriceTooLow = 6097,

    // === IRM Errors (6110-6119) ===
    #[msg("IRM returned invalid rate")]
    IrmInvalidRate = 6110,

    #[msg("IRM error")]
    IrmError = 6111,

    #[msg("IRM returned no data")]
    IrmNoReturnData = 6112,

    #[msg("IRM return data from unexpected program")]
    IrmInvalidProgram = 6113,

    #[msg("IRM return data malformed")]
    IrmInvalidReturnData = 6114,

    #[msg("IRM rate exceeds maximum")]
    IrmRateTooHigh = 6115,

    // === Math Errors (6120-6139) ===
    #[msg("Math overflow")]
    MathOverflow = 6120,

    #[msg("Math underflow")]
    MathUnderflow = 6121,

    #[msg("Division by zero")]
    DivisionByZero = 6122,

    #[msg("Amount exceeds u64 maximum")]
    AmountOverflow = 6123,

    // === Flash Loan Errors (6140-6149) ===
    #[msg("Flash loan not repaid within transaction")]
    FlashLoanNotRepaid = 6140,

    #[msg("Flash loan already in progress")]
    FlashLoanInProgress = 6141,

    #[msg("Flash loan callback failed")]
    FlashLoanCallbackFailed = 6142,
}
