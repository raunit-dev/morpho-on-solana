# Errors & Events (v2)

## Error Codes

```rust
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
}
```

---

## Events

```rust
use anchor_lang::prelude::*;

// === Protocol Events ===

#[event]
pub struct ProtocolInitialized {
    pub owner: Pubkey,
    pub fee_recipient: Pubkey,
}

#[event]
pub struct OwnershipTransferStarted {
    pub current_owner: Pubkey,
    pub pending_owner: Pubkey,
}

#[event]
pub struct OwnershipTransferred {
    pub previous_owner: Pubkey,
    pub new_owner: Pubkey,
}

#[event]
pub struct ProtocolPausedSet {
    pub paused: bool,
}

#[event]
pub struct LltvEnabled {
    pub lltv: u64,
}

#[event]
pub struct IrmEnabled {
    pub irm: Pubkey,
}

// === Market Events ===

#[event]
pub struct MarketCreated {
    pub market_id: [u8; 32],
    pub collateral_mint: Pubkey,
    pub loan_mint: Pubkey,
    pub oracle: Pubkey,
    pub irm: Pubkey,
    pub lltv: u64,
}

#[event]
pub struct MarketPausedSet {
    pub market_id: [u8; 32],
    pub paused: bool,
}

#[event]
pub struct FeeSet {
    pub market_id: [u8; 32],
    pub fee: u64,
}

// === Position Events ===

#[event]
pub struct PositionCreated {
    pub market_id: [u8; 32],
    pub owner: Pubkey,
}

#[event]
pub struct PositionClosed {
    pub market_id: [u8; 32],
    pub owner: Pubkey,
}

// === Supply Events ===

#[event]
pub struct Supply {
    pub market_id: [u8; 32],
    pub supplier: Pubkey,
    pub on_behalf_of: Pubkey,
    pub assets: u128,
    pub shares: u128,
}

#[event]
pub struct Withdraw {
    pub market_id: [u8; 32],
    pub caller: Pubkey,
    pub on_behalf_of: Pubkey,
    pub receiver: Pubkey,
    pub assets: u128,
    pub shares: u128,
}

// === Collateral Events ===

#[event]
pub struct SupplyCollateral {
    pub market_id: [u8; 32],
    pub depositor: Pubkey,
    pub on_behalf_of: Pubkey,
    pub amount: u128,
}

#[event]
pub struct WithdrawCollateral {
    pub market_id: [u8; 32],
    pub caller: Pubkey,
    pub on_behalf_of: Pubkey,
    pub receiver: Pubkey,
    pub amount: u128,
}

// === Borrow Events ===

#[event]
pub struct Borrow {
    pub market_id: [u8; 32],
    pub caller: Pubkey,
    pub on_behalf_of: Pubkey,
    pub receiver: Pubkey,
    pub assets: u128,
    pub shares: u128,
}

#[event]
pub struct Repay {
    pub market_id: [u8; 32],
    pub repayer: Pubkey,
    pub on_behalf_of: Pubkey,
    pub assets: u128,
    pub shares: u128,
}

// === Liquidation Events ===

#[event]
pub struct Liquidation {
    pub market_id: [u8; 32],
    pub liquidator: Pubkey,
    pub borrower: Pubkey,
    pub repaid_assets: u128,
    pub repaid_shares: u128,
    pub seized_collateral: u128,
}

#[event]
pub struct BadDebtRealized {
    pub market_id: [u8; 32],
    pub borrower: Pubkey,
    pub bad_debt_assets: u128,
    pub bad_debt_shares: u128,
}

// === Interest Events ===

#[event]
pub struct InterestAccrued {
    pub market_id: [u8; 32],
    pub interest: u128,
    pub fee_shares: u128,
    pub total_supply_assets: u128,
    pub total_borrow_assets: u128,
}

// === Fee Events ===

#[event]
pub struct FeesClaimed {
    pub market_id: [u8; 32],
    pub recipient: Pubkey,
    pub shares: u128,
}

// === Flash Loan Events ===

#[event]
pub struct FlashLoan {
    pub market_id: [u8; 32],
    pub borrower: Pubkey,
    pub amount: u128,
    pub fee: u128,
}

// === Authorization Events ===

#[event]
pub struct AuthorizationSet {
    pub authorizer: Pubkey,
    pub authorized: Pubkey,
    pub is_authorized: bool,
    pub expires_at: i64,
}
```

---

## Error Handling Patterns

### Checked Math

```rust
// CORRECT - always use checked operations
let result = checked_add(a, b)?;
let result = checked_sub(a, b)?;
let result = checked_mul(a, b)?;
let result = checked_div(a, b)?;

// For token amounts - ALWAYS use safe conversion
let amount_u64 = safe_u128_to_u64(amount)?;

// WRONG - can panic or truncate
let result = a + b;  // Don't do this
let amount = value as u64;  // Don't do this
```

### Require Macros

```rust
// Input validation
require!(amount > 0, MorphoError::ZeroAmount);
require!(fee <= MAX_FEE, MorphoError::FeeTooHigh);

// Authorization
require!(
    caller == owner || is_authorized,
    MorphoError::Unauthorized
);

// State checks
require!(!protocol.paused, MorphoError::ProtocolPaused);
require!(!market.paused, MorphoError::MarketPaused);

// Balance checks
require!(
    position.supply_shares >= shares,
    MorphoError::InsufficientBalance
);
```

---

## Event Emission Guidelines

```rust
// Always emit events AFTER successful state changes
pub fn supply(ctx: Context<Supply>, assets: u128) -> Result<()> {
    // ... checks and state updates ...
    
    // Emit event at the end
    emit!(Supply {
        market_id: ctx.accounts.market.market_id,
        supplier: ctx.accounts.supplier.key(),
        on_behalf_of: ctx.accounts.position.owner,
        assets,
        shares,
    });
    
    Ok(())
}

// For multi-step operations, emit relevant events
pub fn liquidate(...) -> Result<()> {
    // ... liquidation logic ...
    
    // Emit liquidation event
    emit!(Liquidation { ... });
    
    // If bad debt occurred, emit that too
    if bad_debt > 0 {
        emit!(BadDebtRealized { ... });
    }
    
    Ok(())
}
```
