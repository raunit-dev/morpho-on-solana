//! ERC-4626 style share-based accounting
//! 
//! Uses virtual offset (VIRTUAL_SHARES/VIRTUAL_ASSETS) to prevent
//! share inflation attacks on first deposit.
//! 
//! ## Rounding Rules (Always favor protocol)
//! 
//! | Operation | Convert         | Rounding | Reason                  |
//! |-----------|-----------------|----------|-------------------------|
//! | Supply    | assets → shares | DOWN     | User gets fewer shares  |
//! | Withdraw  | shares → assets | DOWN     | User gets fewer assets  |
//! | Borrow    | assets → shares | UP       | User owes more shares   |
//! | Repay     | shares → assets | UP       | User pays more assets   |

use anchor_lang::prelude::*;
use crate::constants::{VIRTUAL_SHARES, VIRTUAL_ASSETS};
use super::safe_math::checked_add;
use super::wad::{mul_div_down, mul_div_up};

/// Convert assets to shares for SUPPLY operations
/// 
/// Rounding: DOWN (user receives fewer shares, protects protocol)
/// 
/// Formula: shares = assets * (totalShares + virtualShares) / (totalAssets + virtualAssets)
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

/// Convert assets to shares for BORROW operations  
/// 
/// Rounding: UP (user owes more shares, protects protocol)
/// 
/// Formula: shares = assets * (totalShares + virtualShares) / (totalAssets + virtualAssets)
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

/// Convert shares to assets for WITHDRAW operations
/// 
/// Rounding: DOWN (user receives fewer assets, protects protocol)
/// 
/// Formula: assets = shares * (totalAssets + virtualAssets) / (totalShares + virtualShares)
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

/// Convert shares to assets for REPAY operations
/// 
/// Rounding: UP (user pays more assets, protects protocol)
/// 
/// Formula: assets = shares * (totalAssets + virtualAssets) / (totalShares + virtualShares)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_first_deposit() {
        // First deposit: 1000 assets
        // shares = 1000 * (0 + 1e6) / (0 + 1) = 1e9
        let shares = to_shares_down(1000, 0, 0).unwrap();
        assert_eq!(shares, 1_000_000_000);
    }

    #[test]
    fn test_share_roundtrip() {
        let assets = 1_000_000u128;
        let total_assets = 10_000_000u128;
        let total_shares = 10_000_000_000_000u128;
        
        // Convert to shares and back
        let shares = to_shares_down(assets, total_assets, total_shares).unwrap();
        let recovered = to_assets_down(
            shares, 
            total_assets + assets, 
            total_shares + shares
        ).unwrap();
        
        // Due to rounding down twice, recovered <= original
        assert!(recovered <= assets);
    }

    #[test]
    fn test_rounding_direction() {
        let assets = 100u128;
        let total_assets = 1000u128;
        let total_shares = 999u128;
        
        let shares_down = to_shares_down(assets, total_assets, total_shares).unwrap();
        let shares_up = to_shares_up(assets, total_assets, total_shares).unwrap();
        
        // UP rounding should give equal or more shares
        assert!(shares_up >= shares_down);
    }

    #[test]
    fn test_inflation_attack_protection() {
        // Attack scenario:
        // 1. Attacker deposits 1 wei as first depositor
        // 2. Attacker donates 1M tokens to vault
        // 3. Victim deposits 1M tokens
        // 
        // With virtual offset, victim still gets meaningful shares
        
        let attacker_deposit = 1u128;
        let attacker_shares = to_shares_down(attacker_deposit, 0, 0).unwrap();
        
        // Attacker "donates" 1M tokens (simulated by just adding to total_assets)
        let donated = 1_000_000u128;
        let total_assets = attacker_deposit + donated;
        
        let victim_deposit = 1_000_000u128;
        let victim_shares = to_shares_down(
            victim_deposit,
            total_assets,
            attacker_shares,
        ).unwrap();
        
        // Victim should get meaningful shares, not 0 or 1
        assert!(victim_shares > 1000);
        
        // Attacker shouldn't get all the victim's funds
        let attacker_value = to_assets_down(
            attacker_shares,
            total_assets + victim_deposit,
            attacker_shares + victim_shares,
        ).unwrap();
        
        // Attacker's share of total should be roughly proportional to their deposit
        // (with some profit from the attack, but limited)
        assert!(attacker_value < donated + victim_deposit);
    }
}
