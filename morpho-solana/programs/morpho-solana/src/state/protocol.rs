//! Protocol-level state account
//! 
//! Single global account managing protocol-wide settings,
//! whitelisted parameters, and ownership.

use anchor_lang::prelude::*;
use crate::constants::{MAX_LLTVS, MAX_IRMS, PROGRAM_SEED_PREFIX};
use crate::errors::MorphoError;

/// Protocol-wide state account
/// 
/// PDA Seeds: [PROGRAM_SEED_PREFIX, b"morpho_protocol"]
#[account]
pub struct ProtocolState {
    /// PDA bump seed
    pub bump: u8,

    /// Protocol owner (can transfer ownership, manage settings)
    pub owner: Pubkey,

    /// Pending owner for 2-step ownership transfer
    pub pending_owner: Pubkey,

    /// Receives protocol fees from all markets
    pub fee_recipient: Pubkey,

    /// Global pause flag - stops all user operations across all markets
    pub paused: bool,

    /// Number of enabled LLTVs (active count in the array)
    pub lltv_count: u8,

    /// Whitelisted LLTV values (basis points, e.g., 8500 = 85%)
    /// Fixed-size array for predictable account size
    pub enabled_lltvs: [u64; MAX_LLTVS],

    /// Number of enabled IRMs
    pub irm_count: u8,

    /// Whitelisted IRM program addresses
    /// Fixed-size array for predictable account size
    pub enabled_irms: [Pubkey; MAX_IRMS],

    /// Total markets created (for stats)
    pub market_count: u64,

    /// Reserved for future upgrades
    pub reserved: [u8; 256],
}

impl ProtocolState {
    pub const SEED: &'static [u8] = b"morpho_protocol";

    pub fn space() -> usize {
        8 +                     // discriminator
        1 +                     // bump
        32 +                    // owner
        32 +                    // pending_owner
        32 +                    // fee_recipient
        1 +                     // paused
        1 +                     // lltv_count
        (8 * MAX_LLTVS) +       // enabled_lltvs
        1 +                     // irm_count
        (32 * MAX_IRMS) +       // enabled_irms
        8 +                     // market_count
        256                     // reserved
    }

    /// Check if an LLTV value is whitelisted
    pub fn is_lltv_enabled(&self, lltv: u64) -> bool {
        self.enabled_lltvs[..self.lltv_count as usize].contains(&lltv)
    }

    /// Check if an IRM program is whitelisted
    pub fn is_irm_enabled(&self, irm: &Pubkey) -> bool {
        self.enabled_irms[..self.irm_count as usize].contains(irm)
    }

    /// Add a new LLTV to the whitelist
    pub fn add_lltv(&mut self, lltv: u64) -> Result<()> {
        require!(
            (self.lltv_count as usize) < MAX_LLTVS,
            MorphoError::MaxLltvsReached
        );
        require!(
            !self.is_lltv_enabled(lltv),
            MorphoError::AlreadyEnabled
        );

        self.enabled_lltvs[self.lltv_count as usize] = lltv;
        self.lltv_count += 1;
        Ok(())
    }

    /// Add a new IRM to the whitelist
    pub fn add_irm(&mut self, irm: Pubkey) -> Result<()> {
        require!(
            (self.irm_count as usize) < MAX_IRMS,
            MorphoError::MaxIrmsReached
        );
        require!(
            !self.is_irm_enabled(&irm),
            MorphoError::AlreadyEnabled
        );

        self.enabled_irms[self.irm_count as usize] = irm;
        self.irm_count += 1;
        Ok(())
    }
}

/// Derive protocol state PDA
pub fn derive_protocol_state(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[PROGRAM_SEED_PREFIX, ProtocolState::SEED],
        program_id,
    )
}
