//! Authorization state account
//! 
//! Enables delegation of position management to authorized addresses.
//! Supports expiration and revocation.

use anchor_lang::prelude::*;
use crate::constants::PROGRAM_SEED_PREFIX;

/// Authorization delegation account
/// 
/// PDA Seeds: [PROGRAM_SEED_PREFIX, b"morpho_authorization", authorizer, authorized]
#[account]
pub struct Authorization {
    /// PDA bump seed
    pub bump: u8,

    /// Account that granted authorization
    pub authorizer: Pubkey,

    /// Account that received authorization
    pub authorized: Pubkey,

    /// Whether authorization is currently active
    pub is_authorized: bool,

    /// Revocation flag (once revoked, cannot be re-enabled without new account)
    pub is_revoked: bool,

    /// Expiration timestamp (0 = no expiry)
    pub expires_at: i64,

    /// Reserved for future use
    pub reserved: [u8; 32],
}

impl Authorization {
    pub const SEED: &'static [u8] = b"morpho_authorization";

    pub fn space() -> usize {
        8 +     // discriminator
        1 +     // bump
        32 +    // authorizer
        32 +    // authorized
        1 +     // is_authorized
        1 +     // is_revoked
        8 +     // expires_at
        32      // reserved
    }

    /// Check if authorization is currently valid
    /// 
    /// Authorization is valid when:
    /// 1. is_authorized is true
    /// 2. is_revoked is false
    /// 3. Either no expiry (0) or current time is before expiry
    pub fn is_valid(&self, current_time: i64) -> bool {
        self.is_authorized && 
        !self.is_revoked &&
        (self.expires_at == 0 || current_time < self.expires_at)
    }

    /// Revoke authorization permanently
    pub fn revoke(&mut self) {
        self.is_authorized = false;
        self.is_revoked = true;
    }
}

/// Derive authorization PDA
pub fn derive_authorization(
    program_id: &Pubkey,
    authorizer: &Pubkey,
    authorized: &Pubkey,
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[
            PROGRAM_SEED_PREFIX,
            Authorization::SEED,
            authorizer.as_ref(),
            authorized.as_ref(),
        ],
        program_id,
    )
}
