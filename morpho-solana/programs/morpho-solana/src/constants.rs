//! Protocol constants and configuration parameters

/// Program-specific seed prefix for all PDAs
pub const PROGRAM_SEED_PREFIX: &[u8] = b"morpho_v1";

// === Fixed-Point Constants ===

/// WAD = 1e18 (standard DeFi fixed-point)
pub const WAD: u128 = 1_000_000_000_000_000_000;

/// Oracle price scale (1e36)
pub const ORACLE_SCALE: u128 = 1_000_000_000_000_000_000_000_000_000_000_000_000;

/// Minimum oracle price (prevents division issues)
/// Set to 1e18 to allow for devnet testing with various oracle feeds
pub const MIN_ORACLE_PRICE: u128 = 1_000_000_000_000_000_000; // 1e18

// Note: MAX_ORACLE_PRICE is computed at runtime via max_oracle_price() in interfaces/oracle.rs
// to avoid compile-time overflow

// === Share Math Constants ===

/// Virtual shares for share inflation protection
pub const VIRTUAL_SHARES: u128 = 1_000_000; // 1e6

/// Virtual assets for share inflation protection
pub const VIRTUAL_ASSETS: u128 = 1;

// === Protocol Limits ===

/// Maximum protocol fee (25% = 2500 basis points)
pub const MAX_FEE: u64 = 2500;

/// Basis points denominator
pub const BPS: u64 = 10_000;

/// Maximum number of whitelisted LLTVs
pub const MAX_LLTVS: usize = 20;

/// Maximum number of whitelisted IRMs
pub const MAX_IRMS: usize = 10;

// === Liquidation Constants ===

/// Maximum Liquidation Incentive Factor (115% = 11500 scaled)
pub const MAX_LIF: u64 = 11_500;

/// LIF cursor (30% = 3000 scaled)
pub const LIF_CURSOR: u64 = 3_000;

/// Basis points for LIF calculations
pub const LIF_BPS: u64 = 10_000;

// === Interest Rate Constants ===

/// Seconds per year for rate conversions
pub const SECONDS_PER_YEAR: u128 = 31_536_000;

/// Maximum borrow rate per second (1000% APY cap)
pub const MAX_BORROW_RATE_PER_SECOND: u128 = WAD * 10 / SECONDS_PER_YEAR;

// === Safe Math Constants ===

/// Maximum value that fits in u64
pub const MAX_U64: u128 = u64::MAX as u128;

// === Flash Loan Constants ===

/// Flash loan fee (0.05% = 5 basis points)
pub const FLASH_LOAN_FEE_BPS: u64 = 5;
