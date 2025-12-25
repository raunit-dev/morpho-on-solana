//! Position state account
//! 
//! One account per user per market, tracking their supply,
//! borrow, and collateral positions.

use anchor_lang::prelude::*;
use crate::constants::PROGRAM_SEED_PREFIX;

/// User position in a specific market
/// 
/// PDA Seeds: [PROGRAM_SEED_PREFIX, b"morpho_position", market_id, owner]
#[account]
pub struct Position {
    /// PDA bump seed
    pub bump: u8,

    /// Market this position belongs to
    pub market_id: [u8; 32],

    /// Position owner
    pub owner: Pubkey,

    /// Supply shares (earns interest via share appreciation)
    pub supply_shares: u128,

    /// Borrow shares (owes interest via share appreciation)
    pub borrow_shares: u128,

    /// Collateral amount (raw tokens, NOT shares)
    /// Collateral does not earn interest in Morpho Blue
    pub collateral: u128,

    /// Reserved for future use
    pub reserved: [u8; 64],
}

impl Position {
    pub const SEED: &'static [u8] = b"morpho_position";

    pub fn space() -> usize {
        8 +     // discriminator
        1 +     // bump
        32 +    // market_id
        32 +    // owner
        16 +    // supply_shares
        16 +    // borrow_shares
        16 +    // collateral
        64      // reserved
    }

    /// Check if position has any activity
    pub fn is_empty(&self) -> bool {
        self.supply_shares == 0 && 
        self.borrow_shares == 0 && 
        self.collateral == 0
    }

    /// Check if position can be closed (empty and initialized)
    pub fn can_close(&self) -> bool {
        self.is_empty() && self.owner != Pubkey::default()
    }

    /// Check if position has any debt
    pub fn has_debt(&self) -> bool {
        self.borrow_shares > 0
    }

    /// Check if position has any collateral
    pub fn has_collateral(&self) -> bool {
        self.collateral > 0
    }
}

/// Derive position PDA
pub fn derive_position(
    program_id: &Pubkey,
    market_id: &[u8; 32],
    owner: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            PROGRAM_SEED_PREFIX,
            Position::SEED,
            market_id,
            owner.as_ref(),
        ],
        program_id,
    )
}
