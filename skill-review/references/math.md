# Math Libraries (v2)

## Table of Contents
1. [Safe Math Utilities](#safe-math-utilities)
2. [Fixed-Point Arithmetic](#fixed-point-arithmetic)
3. [Share Math](#share-math)
4. [Interest Accrual (Fixed Precision)](#interest-accrual-fixed-precision)
5. [Decimals Handling](#decimals-handling)
6. [Liquidation Math](#liquidation-math)
7. [Health Factor](#health-factor)
8. [Bad Debt Handling](#bad-debt-handling)

---

## Safe Math Utilities

Critical: All u128 → u64 conversions must be checked to prevent silent truncation.

```rust
use anchor_lang::prelude::*;
use crate::errors::MorphoError;

/// Maximum value that fits in u64
pub const MAX_U64: u128 = u64::MAX as u128;

/// Safely convert u128 to u64, erroring on overflow
/// CRITICAL: Use this for ALL token transfer amounts
#[inline]
pub fn safe_u128_to_u64(value: u128) -> Result<u64> {
    if value > MAX_U64 {
        return Err(MorphoError::AmountOverflow.into());
    }
    Ok(value as u64)
}

/// Checked addition with custom error
#[inline]
pub fn checked_add(a: u128, b: u128) -> Result<u128> {
    a.checked_add(b).ok_or(MorphoError::MathOverflow.into())
}

/// Checked subtraction with custom error
#[inline]
pub fn checked_sub(a: u128, b: u128) -> Result<u128> {
    a.checked_sub(b).ok_or(MorphoError::MathUnderflow.into())
}

/// Checked multiplication with custom error
#[inline]
pub fn checked_mul(a: u128, b: u128) -> Result<u128> {
    a.checked_mul(b).ok_or(MorphoError::MathOverflow.into())
}

/// Checked division with custom error
#[inline]
pub fn checked_div(a: u128, b: u128) -> Result<u128> {
    if b == 0 {
        return Err(MorphoError::DivisionByZero.into());
    }
    Ok(a / b)
}

/// Saturating subtraction (returns 0 instead of underflow)
#[inline]
pub fn saturating_sub(a: u128, b: u128) -> u128 {
    a.saturating_sub(b)
}

#[cfg(test)]
mod safe_math_tests {
    use super::*;
    
    #[test]
    fn test_safe_u128_to_u64_within_range() {
        assert_eq!(safe_u128_to_u64(1000).unwrap(), 1000u64);
        assert_eq!(safe_u128_to_u64(MAX_U64).unwrap(), u64::MAX);
    }
    
    #[test]
    fn test_safe_u128_to_u64_overflow() {
        let result = safe_u128_to_u64(MAX_U64 + 1);
        assert!(result.is_err());
    }
}
```

---

## Fixed-Point Arithmetic

All calculations use u128 with WAD (1e18) scaling. Order of operations minimizes precision loss.

```rust
pub const WAD: u128 = 1_000_000_000_000_000_000;

/// Multiply then divide, rounding DOWN
/// Order: (a * b) / c - standard mul-div
pub fn mul_div_down(a: u128, b: u128, c: u128) -> Result<u128> {
    if c == 0 {
        return Err(MorphoError::DivisionByZero.into());
    }
    
    // Use u256 simulation for overflow protection
    // For Solana, we'll use checked operations carefully
    let product = checked_mul(a, b)?;
    Ok(product / c)
}

/// Multiply then divide, rounding UP
/// (a * b + c - 1) / c
pub fn mul_div_up(a: u128, b: u128, c: u128) -> Result<u128> {
    if c == 0 {
        return Err(MorphoError::DivisionByZero.into());
    }
    
    if a == 0 || b == 0 {
        return Ok(0);
    }
    
    let product = checked_mul(a, b)?;
    // (product + c - 1) / c = ceil division
    let result = product
        .checked_add(c - 1)
        .ok_or(MorphoError::MathOverflow)?
        / c;
    
    Ok(result)
}

/// WAD multiplication (a * b / WAD), rounded down
#[inline]
pub fn wad_mul_down(a: u128, b: u128) -> Result<u128> {
    mul_div_down(a, b, WAD)
}

/// WAD multiplication (a * b / WAD), rounded up
#[inline]
pub fn wad_mul_up(a: u128, b: u128) -> Result<u128> {
    mul_div_up(a, b, WAD)
}

/// WAD division (a * WAD / b), rounded down
#[inline]
pub fn wad_div_down(a: u128, b: u128) -> Result<u128> {
    mul_div_down(a, WAD, b)
}

/// WAD division (a * WAD / b), rounded up
#[inline]
pub fn wad_div_up(a: u128, b: u128) -> Result<u128> {
    mul_div_up(a, WAD, b)
}

/// Power function for WAD-scaled values
/// Computes base^exp where both are WAD-scaled
pub fn wad_pow(base: u128, exp: u128) -> Result<u128> {
    if exp == 0 {
        return Ok(WAD);
    }
    if base == 0 {
        return Ok(0);
    }
    if base == WAD {
        return Ok(WAD);
    }
    
    // For small exponents, use iterative multiplication
    // For larger, would need log/exp approximation
    let mut result = WAD;
    let mut remaining = exp / WAD; // Integer part of exponent
    
    for _ in 0..remaining {
        result = wad_mul_down(result, base)?;
    }
    
    Ok(result)
}
```

---

## Share Math

ERC-4626 style share-based accounting with virtual offset to prevent inflation attacks.

```rust
/// Virtual offset constants
pub const VIRTUAL_SHARES: u128 = 1_000_000; // 1e6
pub const VIRTUAL_ASSETS: u128 = 1;

/// Convert assets to shares for SUPPLY
/// Rounding: DOWN (user receives fewer shares)
pub fn to_shares_down(
    assets: u128,
    total_assets: u128,
    total_shares: u128,
) -> Result<u128> {
    mul_div_down(
        assets,
        checked_add(total_shares, VIRTUAL_SHARES)?,
        checked_add(total_assets, VIRTUAL_ASSETS)?,
    )
}

/// Convert assets to shares for BORROW
/// Rounding: UP (user owes more shares)
pub fn to_shares_up(
    assets: u128,
    total_assets: u128,
    total_shares: u128,
) -> Result<u128> {
    mul_div_up(
        assets,
        checked_add(total_shares, VIRTUAL_SHARES)?,
        checked_add(total_assets, VIRTUAL_ASSETS)?,
    )
}

/// Convert shares to assets for WITHDRAW
/// Rounding: DOWN (user receives fewer assets)
pub fn to_assets_down(
    shares: u128,
    total_assets: u128,
    total_shares: u128,
) -> Result<u128> {
    mul_div_down(
        shares,
        checked_add(total_assets, VIRTUAL_ASSETS)?,
        checked_add(total_shares, VIRTUAL_SHARES)?,
    )
}

/// Convert shares to assets for REPAY
/// Rounding: UP (user pays more assets)
pub fn to_assets_up(
    shares: u128,
    total_assets: u128,
    total_shares: u128,
) -> Result<u128> {
    mul_div_up(
        shares,
        checked_add(total_assets, VIRTUAL_ASSETS)?,
        checked_add(total_shares, VIRTUAL_SHARES)?,
    )
}
```

### Rounding Rules Summary

| Operation | Convert | Rounding | Reason |
|-----------|---------|----------|--------|
| Supply | assets → shares | DOWN | User gets fewer shares |
| Withdraw | shares → assets | DOWN | User gets fewer assets |
| Borrow | assets → shares | UP | User owes more shares |
| Repay | shares → assets | UP | User pays more assets |

**Always favor the protocol to prevent economic attacks.**

---

## Interest Accrual (Fixed Precision)

Taylor series approximation with CORRECT order of operations to minimize precision loss.

```rust
/// Calculate compound interest factor using Taylor expansion
/// e^(rate * time) - 1 ≈ rt + (rt)²/2 + (rt)³/6
/// 
/// FIXED: Correct order of operations to minimize precision loss
pub fn w_taylor_compounded(rate: u128, time: u128) -> Result<u128> {
    // rt (first term) - scaled by WAD
    let rt = checked_mul(rate, time)?;
    
    if rt == 0 {
        return Ok(0);
    }
    
    // (rt)² / WAD - intermediate step
    let rt_squared = wad_mul_down(rt, rt)?;
    
    // (rt)² / 2 (second term)
    let second_term = checked_div(rt_squared, 2)?;
    
    // (rt)³ / WAD / WAD = rt_squared * rt / WAD
    let rt_cubed_over_wad = wad_mul_down(rt_squared, rt)?;
    
    // (rt)³ / 6 (third term)
    let third_term = checked_div(rt_cubed_over_wad, 6)?;
    
    // Sum all terms
    let result = checked_add(rt, second_term)?;
    let result = checked_add(result, third_term)?;
    
    Ok(result)
}

/// Accrue interest on a market
/// MUST be called before any operation that reads/writes totals
/// 
/// Returns: (interest_amount, fee_shares)
pub fn accrue_interest(
    market: &mut Market,
    current_time: i64,
    borrow_rate: u128, // from IRM, per-second rate scaled by WAD
) -> Result<(u128, u128)> {
    if current_time <= market.last_update {
        return Ok((0, 0));
    }
    
    let elapsed = (current_time - market.last_update) as u128;
    
    if elapsed == 0 || market.total_borrow_assets == 0 {
        market.last_update = current_time;
        return Ok((0, 0));
    }
    
    // Calculate interest using Taylor expansion
    let interest_factor = w_taylor_compounded(borrow_rate, elapsed)?;
    
    // Interest amount = borrow * factor / WAD
    let interest = wad_mul_down(market.total_borrow_assets, interest_factor)?;
    
    if interest == 0 {
        market.last_update = current_time;
        return Ok((0, 0));
    }
    
    // Update totals (interest goes to both supply and borrow)
    market.total_borrow_assets = checked_add(market.total_borrow_assets, interest)?;
    market.total_supply_assets = checked_add(market.total_supply_assets, interest)?;
    
    // Calculate and track fee shares
    let mut fee_shares = 0u128;
    if market.fee > 0 {
        let fee_amount = mul_div_down(
            interest,
            market.fee as u128,
            BPS as u128,
        )?;
        
        if fee_amount > 0 {
            // Fee shares minted - calculate based on state BEFORE adding fee
            fee_shares = to_shares_down(
                fee_amount,
                checked_sub(market.total_supply_assets, fee_amount)?,
                market.total_supply_shares,
            )?;
            
            // Track pending fee shares (to be claimed later)
            market.pending_fee_shares = checked_add(
                market.pending_fee_shares, 
                fee_shares
            )?;
            
            // Increase total supply shares for fee
            market.total_supply_shares = checked_add(
                market.total_supply_shares,
                fee_shares
            )?;
        }
    }
    
    market.last_update = current_time;
    
    Ok((interest, fee_shares))
}
```

---

## Decimals Handling

Proper normalization for different token decimals.

```rust
/// Standard decimals reference
pub const STANDARD_DECIMALS: u8 = 18;

/// Normalize an amount from source decimals to target decimals
pub fn normalize_decimals(
    amount: u128,
    source_decimals: u8,
    target_decimals: u8,
) -> Result<u128> {
    if source_decimals == target_decimals {
        return Ok(amount);
    }
    
    if source_decimals > target_decimals {
        // Scale down
        let diff = source_decimals - target_decimals;
        let divisor = 10u128.pow(diff as u32);
        Ok(amount / divisor)
    } else {
        // Scale up
        let diff = target_decimals - source_decimals;
        let multiplier = 10u128.pow(diff as u32);
        checked_mul(amount, multiplier)
    }
}

/// Convert price from oracle (in base units) to our standard ORACLE_SCALE
/// 
/// Oracle returns: loan_price / collateral_price
/// We need: collateral per 1 loan token (scaled by ORACLE_SCALE)
/// 
/// With decimals: 
/// price = (loan_price / collateral_price) * 10^(collateral_decimals - loan_decimals) * ORACLE_SCALE
pub fn normalize_oracle_price(
    loan_price: u128,
    loan_price_decimals: i32,
    collateral_price: u128,
    collateral_price_decimals: i32,
    loan_token_decimals: u8,
    collateral_token_decimals: u8,
) -> Result<u128> {
    if collateral_price == 0 {
        return Err(MorphoError::OracleInvalidPrice.into());
    }
    
    // Normalize both prices to same decimal base (18 decimals)
    let loan_normalized = normalize_price_value(loan_price, loan_price_decimals)?;
    let collateral_normalized = normalize_price_value(collateral_price, collateral_price_decimals)?;
    
    // base_price = loan / collateral (how many collateral tokens per 1 loan token)
    let base_price = mul_div_down(loan_normalized, WAD, collateral_normalized)?;
    
    // Adjust for token decimals difference
    // If loan has 6 decimals and collateral has 9, we need to scale up by 10^3
    let decimal_adjustment = if collateral_token_decimals >= loan_token_decimals {
        let diff = collateral_token_decimals - loan_token_decimals;
        10u128.pow(diff as u32)
    } else {
        // This means we divide instead
        1u128 // Will handle separately
    };
    
    // Scale to ORACLE_SCALE (1e36)
    let price_scaled = mul_div_down(
        base_price,
        ORACLE_SCALE,
        WAD, // base_price is WAD-scaled
    )?;
    
    // Apply decimal adjustment
    if collateral_token_decimals >= loan_token_decimals {
        checked_mul(price_scaled, decimal_adjustment)
    } else {
        let diff = loan_token_decimals - collateral_token_decimals;
        Ok(price_scaled / 10u128.pow(diff as u32))
    }
}

/// Normalize a price value given its exponent
fn normalize_price_value(price: u128, expo: i32) -> Result<u128> {
    if expo >= 0 {
        checked_mul(price, 10u128.pow(expo as u32))
    } else {
        Ok(price / 10u128.pow((-expo) as u32))
    }
}
```

---

## Liquidation Math

```rust
/// Maximum Liquidation Incentive Factor (115%)
pub const MAX_LIF: u64 = 11_500; // Scaled by 100 for precision

/// Cursor for LIF calculation (30%)
pub const LIF_CURSOR: u64 = 3_000; // Scaled by 100 for precision

/// Basis points for LIF calculations (100 * 100 = 10000)
pub const LIF_BPS: u64 = 10_000;

/// Calculate Liquidation Incentive Factor
/// LIF = min(maxLIF, 1 / (1 - cursor * (1 - LLTV/BPS)))
/// 
/// Higher LLTV = lower LIF (less incentive needed)
/// Lower LLTV = higher LIF (more buffer, more incentive)
pub fn calculate_lif(lltv: u64) -> u64 {
    // (1 - LLTV/BPS) in basis points = (BPS - lltv)
    let one_minus_lltv = BPS.saturating_sub(lltv);
    
    // cursor * (1 - LLTV) / BPS
    // = 3000 * one_minus_lltv / 10000
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
    
    // 1 / denominator scaled = BPS * BPS / denominator
    // But we want result in same scale as MAX_LIF (scaled by 100)
    let lif = (LIF_BPS as u128)
        .checked_mul(LIF_BPS as u128)
        .unwrap_or(u128::MAX)
        .checked_div(denominator as u128)
        .unwrap_or(u128::MAX) as u64;
    
    std::cmp::min(lif, MAX_LIF)
}

/// Example LIF values for common LLTVs:
/// LLTV 50%  → LIF ~1.18 (18% bonus)
/// LLTV 65%  → LIF ~1.12 (12% bonus)
/// LLTV 77%  → LIF ~1.08 (8% bonus)
/// LLTV 85%  → LIF ~1.05 (5% bonus)
/// LLTV 91.5% → LIF ~1.03 (3% bonus)

/// Calculate seized collateral for liquidation
/// seized = repaid_assets * oracle_price * LIF / ORACLE_SCALE / LIF_BPS
pub fn calculate_seized_collateral(
    repaid_assets: u128,      // loan tokens repaid
    oracle_price: u128,       // collateral per loan token (ORACLE_SCALE)
    lif: u64,                 // liquidation incentive factor (scaled)
) -> Result<u128> {
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
```

---

## Health Factor

```rust
/// Oracle price scale
pub const ORACLE_SCALE: u128 = 1_000_000_000_000_000_000_000_000_000_000_000_000; // 1e36

/// Check if a position is liquidatable
pub fn is_liquidatable(
    collateral: u128,         // raw collateral amount
    borrow_shares: u128,      // position borrow shares
    total_borrow_assets: u128,
    total_borrow_shares: u128,
    oracle_price: u128,       // collateral per loan token (ORACLE_SCALE)
    lltv: u64,                // basis points
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
/// health = (collateral * price * lltv) / borrowed
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
    
    wad_div_down(max_borrow, borrowed)
}
```

---

## Bad Debt Handling

```rust
/// Socialize bad debt across all suppliers
/// Called when liquidation leaves position with debt but no collateral
/// 
/// Returns: bad_debt_assets socialized
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
    market.total_borrow_shares = saturating_sub(
        market.total_borrow_shares,
        remaining_borrow_shares,
    );
    market.total_borrow_assets = saturating_sub(
        market.total_borrow_assets,
        bad_debt,
    );
    
    // Remove from supply side (socializes loss)
    market.total_supply_assets = saturating_sub(
        market.total_supply_assets,
        bad_debt,
    );
    
    // Note: total_supply_shares stays the same
    // Each share is now worth slightly less
    
    Ok(bad_debt)
}
```

---

## Unit Tests

```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_to_shares_down_first_deposit() {
        // First deposit: 1000 assets
        // shares = 1000 * (0 + 1e6) / (0 + 1) = 1e9
        let shares = to_shares_down(1000, 0, 0).unwrap();
        assert_eq!(shares, 1_000_000_000);
    }
    
    #[test]
    fn test_to_shares_rounds_down() {
        // Set up scenario where rounding matters
        let assets = 100;
        let total_assets = 1000;
        let total_shares = 1000;
        
        let shares = to_shares_down(assets, total_assets, total_shares).unwrap();
        let shares_up = to_shares_up(assets, total_assets, total_shares).unwrap();
        
        assert!(shares <= shares_up);
    }
    
    #[test]
    fn test_interest_accrual() {
        let rate = 158_000_000_000; // ~5% APY per-second rate
        let time = 86400; // 1 day
        
        let factor = w_taylor_compounded(rate, time).unwrap();
        assert!(factor > 0);
        
        // Should be roughly 0.0137% daily (5% / 365)
        // factor should be ~137e12 (0.000137 * WAD)
    }
    
    #[test]
    fn test_calculate_lif() {
        // LLTV 85% should give LIF around 1.05 (10500)
        let lif = calculate_lif(8500);
        assert!(lif >= 10_400 && lif <= 10_600);
        
        // LLTV 50% should give LIF around 1.18 (11800)
        let lif = calculate_lif(5000);
        assert!(lif >= 11_500 && lif <= 11_900);
    }
    
    #[test]
    fn test_safe_u128_to_u64() {
        assert!(safe_u128_to_u64(0).is_ok());
        assert!(safe_u128_to_u64(u64::MAX as u128).is_ok());
        assert!(safe_u128_to_u64(u64::MAX as u128 + 1).is_err());
    }
}
```
