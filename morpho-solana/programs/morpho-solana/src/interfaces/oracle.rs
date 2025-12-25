//! Oracle interface with Switchboard integration
//! 
//! Oracles return: collateral tokens per 1 loan token (scaled 1e36 = ORACLE_SCALE)
//! 
//! Example: If ETH = $2000 and USDC = $1:
//! - For ETH/USDC market: oracle returns 2000 * 1e36

use anchor_lang::prelude::*;
use switchboard_on_demand::on_demand::accounts::pull_feed::PullFeedAccountData;
use rust_decimal::Decimal;
use crate::constants::{ORACLE_SCALE, MIN_ORACLE_PRICE, BPS, WAD};
use crate::errors::MorphoError;
use crate::state::Market;
use crate::math::{mul_div_down, mul_div_up, to_assets_up};

/// Maximum oracle price (1 billion ratio) - computed at runtime to avoid const overflow
pub fn max_oracle_price() -> u128 {
    ORACLE_SCALE.saturating_mul(1_000_000_000)
}

// ============================================================================
// Switchboard Oracle Integration
// ============================================================================

/// Maximum staleness for oracle data (in slots, ~400ms per slot)
/// 50 slots ≈ 20 seconds
pub const MAX_ORACLE_STALENESS: u64 = 50;

/// Minimum number of oracle samples required
pub const MIN_ORACLE_SAMPLES: u32 = 1;

/// Get validated oracle price from Switchboard pull feed
/// 
/// # Arguments
/// * `oracle_account` - The Switchboard PullFeed account
/// * `market` - The market to validate against
/// * `clock` - The current clock for staleness checks
/// 
/// # Security Checks
/// 1. Oracle account matches market's configured oracle
/// 2. Price data is fresh (within MAX_ORACLE_STALENESS slots)
/// 3. Minimum number of oracle responses received
/// 4. Price is within valid bounds (MIN_ORACLE_PRICE, max_oracle_price())
pub fn get_switchboard_price_validated(
    oracle_account: &AccountInfo,
    market: &Market,
    clock: &Clock,
) -> Result<u128> {
    // Check 1: Oracle account matches market configuration
    require!(
        oracle_account.key() == market.oracle,
        MorphoError::InvalidOracle
    );

    // Parse Switchboard PullFeed account
    let data = oracle_account.try_borrow_data()?;
    let feed = PullFeedAccountData::parse(data)
        .map_err(|_| error!(MorphoError::OracleInvalidReturnData))?;

    // Check 2 & 3: Get validated price with staleness and sample checks
    let price_decimal = feed.get_value(
        clock.slot,
        MAX_ORACLE_STALENESS,
        MIN_ORACLE_SAMPLES,
        true, // only_positive
    ).map_err(|_| error!(MorphoError::OracleStale))?;

    // Convert Decimal to u128 scaled by ORACLE_SCALE
    let price = decimal_to_oracle_scale(&price_decimal)?;

    // Check 4: Price sanity bounds
    require!(price >= MIN_ORACLE_PRICE, MorphoError::OraclePriceTooLow);
    require!(price <= max_oracle_price(), MorphoError::OraclePriceTooHigh);

    Ok(price)
}

/// Convert Switchboard Decimal to ORACLE_SCALE (1e36)
/// 
/// Switchboard returns prices as rust_decimal::Decimal.
/// We need to scale this to our 1e36 ORACLE_SCALE.
fn decimal_to_oracle_scale(decimal: &Decimal) -> Result<u128> {
    // Get the mantissa (scaled integer value)
    // Decimal stores value as mantissa * 10^-scale
    let mantissa = decimal.mantissa();
    let scale = decimal.scale();
    
    // Our ORACLE_SCALE is 1e36
    // If Switchboard gives us a value like 2000.0 with scale 18
    // We need: mantissa * 1e(36 - scale)
    
    let mantissa_u128 = mantissa.unsigned_abs();
    
    if scale <= 36 {
        let scale_factor = 10u128.pow(36 - scale);
        mantissa_u128.checked_mul(scale_factor)
            .ok_or_else(|| error!(MorphoError::MathOverflow))
    } else {
        // Scale down if Switchboard uses more than 36 decimals (unlikely)
        let scale_factor = 10u128.pow(scale - 36);
        Ok(mantissa_u128 / scale_factor)
    }
}

// ============================================================================
// Static Oracle (for testing)
// ============================================================================

/// Oracle configuration account for static price oracle (testing only)
#[account]
pub struct StaticOracle {
    pub bump: u8,
    /// Fixed price scaled by ORACLE_SCALE
    pub price: u128,
    /// Admin who can update price
    pub admin: Pubkey,
}

impl StaticOracle {
    pub const SEED: &'static [u8] = b"static_oracle";

    pub fn space() -> usize {
        8 + 1 + 16 + 32
    }
}

/// Get validated oracle price (supports both Switchboard and Static Oracle)
/// 
/// This function auto-detects the oracle type based on account size:
/// - Large accounts (>1KB) are treated as Switchboard PullFeed
/// - Small accounts are treated as StaticOracle (for testing)
/// 
/// # Security Checks
/// 1. Oracle account matches market's configured oracle
/// 2. Price is within valid bounds (MIN_ORACLE_PRICE, max_oracle_price())
pub fn get_oracle_price_validated(
    oracle_account: &AccountInfo,
    market: &Market,
) -> Result<u128> {
    // Check 1: Oracle account matches market configuration
    require!(
        oracle_account.key() == market.oracle,
        MorphoError::InvalidOracle
    );

    let data = oracle_account.try_borrow_data()?;
    let data_len = data.len();
    
    // Try to parse as Switchboard PullFeed first (accounts are fairly large ~3KB)
    if data_len >= 1000 {
        if let Ok(feed) = PullFeedAccountData::parse(data) {
            // Use very lenient staleness for basic lookup without Clock
            // For production, use get_switchboard_price_validated with Clock
            if let Ok(price_decimal) = feed.get_value(0, u64::MAX, 1, true) {
                if let Ok(price) = decimal_to_oracle_scale(&price_decimal) {
                    if price >= MIN_ORACLE_PRICE && price <= max_oracle_price() {
                        return Ok(price);
                    }
                }
            }
        }
        // If Switchboard parsing fails, try static oracle
        // Need to re-borrow data
        let data = oracle_account.try_borrow_data()?;
        return parse_static_oracle_price(&data);
    }
    
    // Fall back to Static Oracle for testing
    parse_static_oracle_price(&data)
}

/// Parse price from StaticOracle account data
fn parse_static_oracle_price(data: &[u8]) -> Result<u128> {
    // Skip discriminator (8 bytes) and bump (1 byte)
    if data.len() < 25 {
        return Err(MorphoError::OracleInvalidReturnData.into());
    }
    
    let price = u128::from_le_bytes(
        data[9..25].try_into().map_err(|_| MorphoError::OracleInvalidReturnData)?
    );

    // Price sanity bounds
    require!(price >= MIN_ORACLE_PRICE, MorphoError::OraclePriceTooLow);
    require!(price <= max_oracle_price(), MorphoError::OraclePriceTooHigh);

    Ok(price)
}

// ============================================================================
// Liquidation Math
// ============================================================================

/// Check if a position is liquidatable
/// 
/// A position is liquidatable when:
/// borrowed_value > collateral_value * lltv
pub fn is_liquidatable(
    collateral: u128,
    borrow_shares: u128,
    total_borrow_assets: u128,
    total_borrow_shares: u128,
    oracle_price: u128,
    lltv: u64,
) -> Result<bool> {
    if borrow_shares == 0 {
        return Ok(false);
    }

    // Convert borrow shares to assets (round UP for safety)
    let borrowed = to_assets_up(
        borrow_shares,
        total_borrow_assets,
        total_borrow_shares,
    )?;

    // Max borrowable = collateral * price * lltv / ORACLE_SCALE / BPS
    let collateral_value = mul_div_down(collateral, oracle_price, ORACLE_SCALE)?;
    let max_borrow = mul_div_down(collateral_value, lltv as u128, BPS as u128)?;

    Ok(borrowed > max_borrow)
}

/// Calculate health factor (scaled by WAD)
/// 
/// health > WAD means healthy
/// health <= WAD means liquidatable
pub fn health_factor(
    collateral: u128,
    borrowed: u128,
    oracle_price: u128,
    lltv: u64,
) -> Result<u128> {
    if borrowed == 0 {
        return Ok(u128::MAX); // Infinite health (no debt)
    }

    let collateral_value = mul_div_down(collateral, oracle_price, ORACLE_SCALE)?;
    let max_borrow = mul_div_down(collateral_value, lltv as u128, BPS as u128)?;

    // health = max_borrow * WAD / borrowed
    mul_div_down(max_borrow, WAD, borrowed)
}

/// Calculate Liquidation Incentive Factor (LIF)
/// 
/// LIF = min(maxLIF, 1 / (1 - cursor * (1 - LLTV/BPS)))
/// 
/// Higher LLTV = lower LIF (less incentive needed)
/// Lower LLTV = higher LIF (more buffer, more incentive)
pub fn calculate_lif(lltv: u64) -> u64 {
    use crate::constants::{MAX_LIF, LIF_CURSOR, LIF_BPS};
    
    // (1 - LLTV/BPS) in basis points = (BPS - lltv)
    let one_minus_lltv = BPS.saturating_sub(lltv);

    // cursor * (1 - LLTV) / BPS
    let cursor_term = (LIF_CURSOR as u128)
        .checked_mul(one_minus_lltv as u128)
        .unwrap_or(0)
        .checked_div(LIF_BPS as u128)
        .unwrap_or(0) as u64;

    // 1 - cursor_term (in BPS)
    let denominator = LIF_BPS.saturating_sub(cursor_term);

    if denominator == 0 {
        return MAX_LIF;
    }

    // BPS * BPS / denominator (scaled result)
    let lif = (LIF_BPS as u128)
        .checked_mul(LIF_BPS as u128)
        .unwrap_or(u128::MAX)
        .checked_div(denominator as u128)
        .unwrap_or(u128::MAX) as u64;

    std::cmp::min(lif, MAX_LIF)
}

/// Calculate seized collateral for liquidation
/// 
/// seized = repaid_assets * oracle_price * LIF / ORACLE_SCALE / LIF_BPS
pub fn calculate_seized_collateral(
    repaid_assets: u128,
    oracle_price: u128,
    lif: u64,
) -> Result<u128> {
    use crate::constants::LIF_BPS;
    
    // collateral_value = repaid * price / ORACLE_SCALE
    let collateral_value = mul_div_up(
        repaid_assets,
        oracle_price,
        ORACLE_SCALE,
    )?;

    // seized = collateral_value * lif / LIF_BPS
    mul_div_up(
        collateral_value,
        lif as u128,
        LIF_BPS as u128,
    )
}

/// Socialize bad debt across all suppliers
/// 
/// Called when liquidation leaves position with debt but no collateral.
/// 
/// # Returns
/// The amount of bad debt socialized
pub fn socialize_bad_debt(
    market: &mut Market,
    remaining_borrow_shares: u128,
) -> Result<u128> {
    if remaining_borrow_shares == 0 {
        return Ok(0);
    }

    // Calculate bad debt in assets
    let bad_debt = to_assets_up(
        remaining_borrow_shares,
        market.total_borrow_assets,
        market.total_borrow_shares,
    )?;

    // Remove from borrow side
    market.total_borrow_shares = market.total_borrow_shares.saturating_sub(remaining_borrow_shares);
    market.total_borrow_assets = market.total_borrow_assets.saturating_sub(bad_debt);

    // Remove from supply side (socializes loss)
    market.total_supply_assets = market.total_supply_assets.saturating_sub(bad_debt);

    // Note: total_supply_shares stays the same
    // Each share is now worth slightly less

    Ok(bad_debt)
}
