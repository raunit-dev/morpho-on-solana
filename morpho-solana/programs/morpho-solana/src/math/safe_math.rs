//! Safe math utilities to prevent overflow/underflow
//! 
//! CRITICAL: All u128 → u64 conversions must use safe_u128_to_u64()
//! to prevent silent truncation in token transfers.

use anchor_lang::prelude::*;
use crate::errors::MorphoError;
use crate::constants::MAX_U64;

/// Safely convert u128 to u64, erroring on overflow
/// 
/// CRITICAL: Use this for ALL token transfer amounts
/// 
/// # Example
/// ```ignore
/// let amount_u64 = safe_u128_to_u64(amount_u128)?;
/// transfer_tokens(..., amount_u64)?;
/// ```
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
    a.checked_add(b).ok_or_else(|| MorphoError::MathOverflow.into())
}

/// Checked subtraction with custom error
#[inline]
pub fn checked_sub(a: u128, b: u128) -> Result<u128> {
    a.checked_sub(b).ok_or_else(|| MorphoError::MathUnderflow.into())
}

/// Checked multiplication with custom error
#[inline]
pub fn checked_mul(a: u128, b: u128) -> Result<u128> {
    a.checked_mul(b).ok_or_else(|| MorphoError::MathOverflow.into())
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

/// Saturating addition (returns MAX instead of overflow)
#[inline]
pub fn saturating_add(a: u128, b: u128) -> u128 {
    a.saturating_add(b)
}

/// Get the minimum of two values
#[inline]
pub fn min(a: u128, b: u128) -> u128 {
    if a < b { a } else { b }
}

/// Get the maximum of two values
#[inline]
pub fn max(a: u128, b: u128) -> u128 {
    if a > b { a } else { b }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_safe_u128_to_u64_within_range() {
        assert_eq!(safe_u128_to_u64(0).unwrap(), 0u64);
        assert_eq!(safe_u128_to_u64(1000).unwrap(), 1000u64);
        assert_eq!(safe_u128_to_u64(MAX_U64).unwrap(), u64::MAX);
    }

    #[test]
    fn test_safe_u128_to_u64_overflow() {
        let result = safe_u128_to_u64(MAX_U64 + 1);
        assert!(result.is_err());
    }

    #[test]
    fn test_checked_add() {
        assert_eq!(checked_add(1, 2).unwrap(), 3);
        assert!(checked_add(u128::MAX, 1).is_err());
    }

    #[test]
    fn test_checked_sub() {
        assert_eq!(checked_sub(5, 3).unwrap(), 2);
        assert!(checked_sub(3, 5).is_err());
    }

    #[test]
    fn test_checked_mul() {
        assert_eq!(checked_mul(3, 4).unwrap(), 12);
        assert!(checked_mul(u128::MAX, 2).is_err());
    }

    #[test]
    fn test_checked_div() {
        assert_eq!(checked_div(10, 2).unwrap(), 5);
        assert!(checked_div(10, 0).is_err());
    }
}
