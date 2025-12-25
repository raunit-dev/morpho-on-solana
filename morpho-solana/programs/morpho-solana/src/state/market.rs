//! Market state account
//! 
//! One account per isolated lending market.
//! Each market has exactly one collateral token, one loan token,
//! one oracle, one IRM, and one LLTV.

use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;
use crate::constants::{PROGRAM_SEED_PREFIX, WAD, BPS};
use crate::math::{mul_div_down, checked_sub};

/// Individual lending market state
/// 
/// PDA Seeds: [PROGRAM_SEED_PREFIX, b"morpho_market", market_id]
#[account]
pub struct Market {
    /// PDA bump seed
    pub bump: u8,

    /// Unique market identifier (keccak256 hash of parameters)
    pub market_id: [u8; 32],

    // === Immutable Parameters (set at creation) ===

    /// Collateral token mint
    pub collateral_mint: Pubkey,

    /// Loan token mint
    pub loan_mint: Pubkey,

    /// Collateral token decimals (cached for gas savings)
    pub collateral_decimals: u8,

    /// Loan token decimals (cached for gas savings)
    pub loan_decimals: u8,

    /// Oracle program/account for price
    pub oracle: Pubkey,

    /// Interest rate model program
    pub irm: Pubkey,

    /// Loan-to-value ratio (basis points, e.g., 8500 = 85%)
    pub lltv: u64,

    // === Mutable State ===

    /// Market-specific pause flag
    pub paused: bool,

    /// Protocol fee (basis points, max 2500 = 25%)
    pub fee: u64,

    /// Total loan tokens supplied (increases with interest)
    pub total_supply_assets: u128,

    /// Total supply shares outstanding
    pub total_supply_shares: u128,

    /// Total loan tokens borrowed (increases with interest)
    pub total_borrow_assets: u128,

    /// Total borrow shares outstanding
    pub total_borrow_shares: u128,

    /// Last interest accrual timestamp
    pub last_update: i64,

    /// Accumulated fee shares owed to fee_recipient
    /// Periodically claimed via claim_fees instruction
    pub pending_fee_shares: u128,

    // === Vault Bumps ===

    /// Bump for collateral vault PDA
    pub collateral_vault_bump: u8,

    /// Bump for loan vault PDA
    pub loan_vault_bump: u8,

    // === Flash Loan Lock ===
    
    /// Flash loan lock (non-zero means flash loan in progress)
    pub flash_loan_lock: u8,

    /// Reserved for future use
    pub reserved: [u8; 127],
}

impl Market {
    pub const SEED: &'static [u8] = b"morpho_market";
    pub const COLLATERAL_VAULT_SEED: &'static [u8] = b"morpho_collateral_vault";
    pub const LOAN_VAULT_SEED: &'static [u8] = b"morpho_loan_vault";

    pub fn space() -> usize {
        8 +     // discriminator
        1 +     // bump
        32 +    // market_id
        32 +    // collateral_mint
        32 +    // loan_mint
        1 +     // collateral_decimals
        1 +     // loan_decimals
        32 +    // oracle
        32 +    // irm
        8 +     // lltv
        1 +     // paused
        8 +     // fee
        16 +    // total_supply_assets
        16 +    // total_supply_shares
        16 +    // total_borrow_assets
        16 +    // total_borrow_shares
        8 +     // last_update
        16 +    // pending_fee_shares
        1 +     // collateral_vault_bump
        1 +     // loan_vault_bump
        1 +     // flash_loan_lock
        127     // reserved
    }

    /// Calculate utilization rate (scaled by WAD = 1e18)
    pub fn utilization(&self) -> u128 {
        if self.total_supply_assets == 0 {
            return 0;
        }
        mul_div_down(
            self.total_borrow_assets,
            WAD,
            self.total_supply_assets,
        ).unwrap_or(0)
    }

    /// Get available liquidity (supply - borrows)
    pub fn available_liquidity(&self) -> u128 {
        checked_sub(self.total_supply_assets, self.total_borrow_assets).unwrap_or(0)
    }

    /// Check if market is operational (not paused)
    pub fn is_operational(&self) -> bool {
        !self.paused
    }

    /// Check if flash loan is in progress
    pub fn is_flash_loan_active(&self) -> bool {
        self.flash_loan_lock != 0
    }
}

/// Calculate unique market identifier
/// 
/// Matches Morpho Blue's Id derivation using keccak256 hash
/// of the market parameters.
pub fn calculate_market_id(
    collateral_mint: &Pubkey,
    loan_mint: &Pubkey,
    oracle: &Pubkey,
    irm: &Pubkey,
    lltv: u64,
) -> [u8; 32] {
    let mut data = Vec::with_capacity(32 * 4 + 8);
    data.extend_from_slice(collateral_mint.as_ref());
    data.extend_from_slice(loan_mint.as_ref());
    data.extend_from_slice(oracle.as_ref());
    data.extend_from_slice(irm.as_ref());
    data.extend_from_slice(&lltv.to_le_bytes());

    keccak::hash(&data).to_bytes()
}

/// Verify market ID matches expected parameters
pub fn verify_market_id(
    market_id: &[u8; 32],
    collateral_mint: &Pubkey,
    loan_mint: &Pubkey,
    oracle: &Pubkey,
    irm: &Pubkey,
    lltv: u64,
) -> bool {
    let expected = calculate_market_id(
        collateral_mint,
        loan_mint,
        oracle,
        irm,
        lltv,
    );
    market_id == &expected
}

/// Derive market PDA
pub fn derive_market(program_id: &Pubkey, market_id: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[PROGRAM_SEED_PREFIX, Market::SEED, market_id],
        program_id,
    )
}

/// Derive collateral vault PDA
pub fn derive_collateral_vault(program_id: &Pubkey, market_id: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[PROGRAM_SEED_PREFIX, Market::COLLATERAL_VAULT_SEED, market_id],
        program_id,
    )
}

/// Derive loan vault PDA
pub fn derive_loan_vault(program_id: &Pubkey, market_id: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[PROGRAM_SEED_PREFIX, Market::LOAN_VAULT_SEED, market_id],
        program_id,
    )
}
