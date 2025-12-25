//! Interest Rate Model interface
//! 
//! IRMs return: borrow rate per second (scaled 1e18 = WAD)
//! 
//! Example: 5% APY ≈ 1.58e-9 per second = 1_580_000_000 when scaled by WAD

use anchor_lang::prelude::*;
use crate::constants::{WAD, SECONDS_PER_YEAR, MAX_BORROW_RATE_PER_SECOND};
use crate::errors::MorphoError;
use crate::math::{mul_div_down, checked_add, wad_mul_down};

/// Linear (Kinked) IRM configuration
#[account]
pub struct LinearIrm {
    pub bump: u8,
    
    /// Base rate at 0% utilization (yearly, WAD-scaled)
    pub base_rate: u128,
    
    /// Slope below kink (yearly, WAD-scaled)
    pub slope1: u128,
    
    /// Slope above kink (yearly, WAD-scaled)
    pub slope2: u128,
    
    /// Utilization kink point (WAD-scaled, e.g., 0.8e18 = 80%)
    pub kink: u128,
    
    /// Admin who can update parameters
    pub admin: Pubkey,
}

impl LinearIrm {
    pub const SEED: &'static [u8] = b"linear_irm";

    pub fn space() -> usize {
        8 + 1 + 16 * 4 + 32
    }

    /// Calculate borrow rate per second
    pub fn borrow_rate(&self, supply: u128, borrow: u128) -> Result<u128> {
        if supply == 0 {
            // Return base rate when no supply
            return Ok(self.base_rate / SECONDS_PER_YEAR);
        }

        // Utilization = borrow / supply (WAD-scaled)
        let utilization = mul_div_down(borrow, WAD, supply)?;

        let yearly_rate = if utilization <= self.kink {
            // Below kink: base + slope1 * utilization / WAD
            let variable = wad_mul_down(utilization, self.slope1)?;
            checked_add(self.base_rate, variable)?
        } else {
            // Above kink: rate_at_kink + slope2 * (utilization - kink) / WAD
            let rate_at_kink = checked_add(
                self.base_rate,
                wad_mul_down(self.kink, self.slope1)?,
            )?;
            let excess = utilization.saturating_sub(self.kink);
            let excess_rate = wad_mul_down(excess, self.slope2)?;
            checked_add(rate_at_kink, excess_rate)?
        };

        // Convert to per-second rate and apply cap
        let per_second = yearly_rate / SECONDS_PER_YEAR;
        Ok(std::cmp::min(per_second, MAX_BORROW_RATE_PER_SECOND))
    }
}

/// Get borrow rate from IRM - for internal use during interest accrual
/// 
/// This simplified version calculates rate based on utilization.
/// In production with external IRM programs, this would do CPI.
pub fn get_borrow_rate_internal(
    total_supply_assets: u128,
    total_borrow_assets: u128,
) -> Result<u128> {
    if total_supply_assets == 0 {
        return Ok(0);
    }

    // Default: 5% base + 15% variable (max 20% at 100% util)
    let utilization = mul_div_down(total_borrow_assets, WAD, total_supply_assets)?;
    
    // base_rate: 5% APY = 0.05 WAD
    let base_rate = WAD / 20;
    
    // Variable rate up to 15% based on utilization
    let variable_rate = wad_mul_down(utilization, WAD * 15 / 100)?;
    
    let yearly_rate = checked_add(base_rate, variable_rate)?;
    let per_second = yearly_rate / SECONDS_PER_YEAR;
    
    // Apply rate cap
    Ok(std::cmp::min(per_second, MAX_BORROW_RATE_PER_SECOND))
}

// Example IRM configurations:
// 
// STABLE (USDC lending):
//   base_rate: 0.01e18  (1% base)
//   slope1:    0.04e18  (4% slope below kink)
//   slope2:    0.75e18  (75% slope above kink)
//   kink:      0.80e18  (80% target utilization)
//
// VOLATILE (ETH lending):
//   base_rate: 0.02e18  (2% base)
//   slope1:    0.08e18  (8% slope below kink)
//   slope2:    1.00e18  (100% slope above kink)
//   kink:      0.70e18  (70% target utilization)
