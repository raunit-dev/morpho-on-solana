//! Fixed-point WAD (1e18) arithmetic operations
//! 
//! All calculations use u128 with WAD scaling.
//! Order of operations is designed to minimize precision loss.

use anchor_lang::prelude::*;
use crate::errors::MorphoError;
use crate::constants::WAD;
use super::safe_math::{checked_mul, checked_add};

/// Multiply then divide, rounding DOWN
/// Order: (a * b) / c
/// 
/// # Arguments
/// * `a` - First multiplicand
/// * `b` - Second multiplicand  
/// * `c` - Divisor (must be non-zero)
pub fn mul_div_down(a: u128, b: u128, c: u128) -> Result<u128> {
    if c == 0 {
        return Err(MorphoError::DivisionByZero.into());
    }
    
    if a == 0 || b == 0 {
        return Ok(0);
    }
    
    let product = checked_mul(a, b)?;
    Ok(product / c)
}

/// Multiply then divide, rounding UP
/// Formula: (a * b + c - 1) / c
/// 
/// # Arguments
/// * `a` - First multiplicand
/// * `b` - Second multiplicand
/// * `c` - Divisor (must be non-zero)
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

/// Calculate compound interest factor using Taylor expansion
/// e^(rate * time) - 1 ≈ rt + (rt)²/2 + (rt)³/6
/// 
/// This gives the interest FACTOR to multiply against principal.
/// 
/// # Arguments
/// * `rate` - Per-second interest rate (WAD-scaled)
/// * `time` - Time elapsed in seconds
pub fn w_taylor_compounded(rate: u128, time: u128) -> Result<u128> {
    // rt (first term) - scaled by WAD
    let rt = checked_mul(rate, time)?;
    
    if rt == 0 {
        return Ok(0);
    }
    
    // (rt)² / WAD
    let rt_squared = wad_mul_down(rt, rt)?;
    
    // (rt)² / 2 (second term)
    let second_term = rt_squared / 2;
    
    // (rt)³ / WAD / WAD = rt_squared * rt / WAD
    let rt_cubed_over_wad = wad_mul_down(rt_squared, rt)?;
    
    // (rt)³ / 6 (third term)
    let third_term = rt_cubed_over_wad / 6;
    
    // Sum all terms: rt + rt²/2 + rt³/6
    let result = checked_add(rt, second_term)?;
    let result = checked_add(result, third_term)?;
    
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mul_div_down() {
        // 100 * 200 / 300 = 66.666... → 66
        assert_eq!(mul_div_down(100, 200, 300).unwrap(), 66);
        
        // Edge cases
        assert_eq!(mul_div_down(0, 100, 50).unwrap(), 0);
        assert_eq!(mul_div_down(100, 0, 50).unwrap(), 0);
        assert!(mul_div_down(100, 200, 0).is_err());
    }

    #[test]
    fn test_mul_div_up() {
        // 100 * 200 / 300 = 66.666... → 67
        assert_eq!(mul_div_up(100, 200, 300).unwrap(), 67);
        
        // Exact division should be same
        assert_eq!(mul_div_up(100, 200, 200).unwrap(), 100);
    }

    #[test]
    fn test_wad_mul() {
        let half_wad = WAD / 2;
        
        // 0.5 * 1.0 = 0.5
        assert_eq!(wad_mul_down(half_wad, WAD).unwrap(), half_wad);
        
        // 0.5 * 0.5 = 0.25
        assert_eq!(wad_mul_down(half_wad, half_wad).unwrap(), WAD / 4);
    }

    #[test]
    fn test_taylor_compounded() {
        // 5% APY ≈ 1.58e-9 per second rate
        let rate = 158_000_000_000u128; // ~5% APY per-second rate
        let time = 86400u128; // 1 day
        
        let factor = w_taylor_compounded(rate, time).unwrap();
        assert!(factor > 0);
        
        // Zero rate should give zero factor
        assert_eq!(w_taylor_compounded(0, time).unwrap(), 0);
        
        // Zero time should give zero factor
        assert_eq!(w_taylor_compounded(rate, 0).unwrap(), 0);
    }
}
