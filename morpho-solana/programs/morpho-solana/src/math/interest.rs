//! Interest accrual logic for lending markets
//! 
//! Interest is compounded using Taylor series approximation.
//! Fee shares are tracked separately for later claiming.

use anchor_lang::prelude::*;
use crate::constants::BPS;
use crate::state::Market;
use super::safe_math::{checked_add, checked_sub};
use super::wad::{w_taylor_compounded, wad_mul_down, mul_div_down};
use super::shares::to_shares_down;

/// Result of interest accrual
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AccrualResult {
    /// Interest amount accrued (in loan token units)
    pub interest: u128,
    /// Fee shares minted (if fee > 0)
    pub fee_shares: u128,
}

/// Accrue interest on a market
/// 
/// MUST be called before any operation that reads/writes market totals.
/// 
/// # Arguments
/// * `market` - Market account to accrue interest on
/// * `current_time` - Current Unix timestamp
/// * `borrow_rate` - Per-second borrow rate from IRM (WAD-scaled)
/// 
/// # Returns
/// AccrualResult with interest and fee_shares
pub fn accrue_interest_on_market(
    market: &mut Market,
    current_time: i64,
    borrow_rate: u128,
) -> Result<AccrualResult> {
    // No time has passed
    if current_time <= market.last_update {
        return Ok(AccrualResult { interest: 0, fee_shares: 0 });
    }
    
    let elapsed = (current_time - market.last_update) as u128;
    
    // No borrows = no interest
    if elapsed == 0 || market.total_borrow_assets == 0 {
        market.last_update = current_time;
        return Ok(AccrualResult { interest: 0, fee_shares: 0 });
    }
    
    // Calculate interest using Taylor expansion
    let interest_factor = w_taylor_compounded(borrow_rate, elapsed)?;
    
    // Interest amount = borrow * factor / WAD
    let interest = wad_mul_down(market.total_borrow_assets, interest_factor)?;
    
    if interest == 0 {
        market.last_update = current_time;
        return Ok(AccrualResult { interest: 0, fee_shares: 0 });
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
            // This is correct because the fee is taken from the interest
            fee_shares = to_shares_down(
                fee_amount,
                checked_sub(market.total_supply_assets, fee_amount)?,
                market.total_supply_shares,
            )?;
            
            // Increase total supply shares for fee
            market.total_supply_shares = checked_add(
                market.total_supply_shares,
                fee_shares,
            )?;
            
            // Track pending fee shares
            market.pending_fee_shares = checked_add(
                market.pending_fee_shares,
                fee_shares,
            )?;
        }
    }
    
    market.last_update = current_time;
    
    Ok(AccrualResult { interest, fee_shares })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::constants::WAD;

    fn create_test_market() -> Market {
        Market {
            bump: 0,
            market_id: [0u8; 32],
            collateral_mint: Pubkey::default(),
            loan_mint: Pubkey::default(),
            collateral_decimals: 9,
            loan_decimals: 6,
            oracle: Pubkey::default(),
            irm: Pubkey::default(),
            lltv: 8500,
            paused: false,
            fee: 0,
            total_supply_assets: 1_000_000_000_000,
            total_supply_shares: 1_000_000_000_000_000_000,
            total_borrow_assets: 500_000_000_000,
            total_borrow_shares: 500_000_000_000_000_000,
            last_update: 0,
            pending_fee_shares: 0,
            collateral_vault_bump: 0,
            loan_vault_bump: 0,
            flash_loan_lock: 0,
            reserved: [0u8; 127],
        }
    }

    #[test]
    fn test_no_interest_no_borrow() {
        let mut market = create_test_market();
        market.total_borrow_assets = 0;
        
        let result = accrue_interest_on_market(
            &mut market,
            1000,
            WAD / 20 / 31_536_000,
        ).unwrap();
        
        assert_eq!(result.interest, 0);
        assert_eq!(result.fee_shares, 0);
    }

    #[test]
    fn test_interest_accrues() {
        let mut market = create_test_market();
        let initial_borrow = market.total_borrow_assets;
        
        let rate = WAD / 20 / 31_536_000; // 5% APY
        
        let result = accrue_interest_on_market(
            &mut market,
            31_536_000, // 1 year
            rate,
        ).unwrap();
        
        assert!(result.interest > 0);
        assert!(market.total_borrow_assets > initial_borrow);
    }
}
