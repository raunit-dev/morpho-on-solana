# Account Structures (v2)

## Table of Contents
1. [Protocol State](#protocol-state)
2. [Market](#market)
3. [Position](#position)
4. [Authorization](#authorization)
5. [Fee Recipient Registry](#fee-recipient-registry)
6. [PDA Derivation](#pda-derivation)
7. [Market ID Calculation](#market-id-calculation)
8. [Constants](#constants)

---

## Protocol State

Single global account with fixed-size arrays (no Vecs) for predictable sizing.

```rust
use anchor_lang::prelude::*;

/// Maximum number of whitelisted LLTVs
pub const MAX_LLTVS: usize = 20;

/// Maximum number of whitelisted IRMs
pub const MAX_IRMS: usize = 10;

#[account]
pub struct ProtocolState {
    /// PDA bump seed
    pub bump: u8,
    
    /// Protocol owner (can transfer ownership)
    pub owner: Pubkey,
    
    /// Pending owner for 2-step transfer
    pub pending_owner: Pubkey,
    
    /// Receives protocol fees
    pub fee_recipient: Pubkey,
    
    /// Global pause flag - stops all user operations
    pub paused: bool,
    
    /// Number of enabled LLTVs
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
    
    /// Reserved for future use
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
    
    pub fn is_lltv_enabled(&self, lltv: u64) -> bool {
        self.enabled_lltvs[..self.lltv_count as usize]
            .contains(&lltv)
    }
    
    pub fn is_irm_enabled(&self, irm: &Pubkey) -> bool {
        self.enabled_irms[..self.irm_count as usize]
            .contains(irm)
    }
    
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
```

---

## Market

One account per isolated lending market with per-market pause.

```rust
#[account]
pub struct Market {
    /// PDA bump seed
    pub bump: u8,
    
    /// Unique market identifier (keccak256 hash)
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
    
    /// Reserved for future use
    pub reserved: [u8; 128],
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
        128     // reserved
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
        )
    }
    
    /// Get available liquidity
    pub fn available_liquidity(&self) -> u128 {
        self.total_supply_assets.saturating_sub(self.total_borrow_assets)
    }
    
    /// Check if market is operational
    pub fn is_operational(&self) -> bool {
        !self.paused
    }
}
```

---

## Position

One account per user per market.

```rust
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
}
```

---

## Authorization

Delegation account for authorized managers.

```rust
#[account]
pub struct Authorization {
    /// PDA bump seed
    pub bump: u8,
    
    /// Account that granted authorization
    pub authorizer: Pubkey,
    
    /// Account that received authorization
    pub authorized: Pubkey,
    
    /// Whether authorization is active
    pub is_authorized: bool,
    
    /// Optional: expiration timestamp (0 = no expiry)
    pub expires_at: i64,
}

impl Authorization {
    pub const SEED: &'static [u8] = b"morpho_authorization";
    
    pub fn space() -> usize {
        8 +     // discriminator
        1 +     // bump
        32 +    // authorizer
        32 +    // authorized
        1 +     // is_authorized
        8       // expires_at
    }
    
    /// Check if authorization is valid
    pub fn is_valid(&self, current_time: i64) -> bool {
        self.is_authorized && 
        (self.expires_at == 0 || current_time < self.expires_at)
    }
}
```

---

## Fee Recipient Registry

Tracks fee recipient position across all markets for efficient claiming.

```rust
#[account]
pub struct FeeRecipientRegistry {
    /// PDA bump seed
    pub bump: u8,
    
    /// Current fee recipient
    pub fee_recipient: Pubkey,
    
    /// Number of markets with pending fees
    pub markets_with_fees: u64,
}

impl FeeRecipientRegistry {
    pub const SEED: &'static [u8] = b"morpho_fee_registry";
    
    pub fn space() -> usize {
        8 +     // discriminator
        1 +     // bump
        32 +    // fee_recipient
        8       // markets_with_fees
    }
}
```

---

## PDA Derivation

All PDAs use program-specific prefixes to prevent collision attacks.

```rust
use anchor_lang::prelude::*;

/// Program-specific seed prefix for all PDAs
pub const PROGRAM_SEED_PREFIX: &[u8] = b"morpho_v1";

/// Derive protocol state PDA
pub fn derive_protocol_state(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[PROGRAM_SEED_PREFIX, ProtocolState::SEED],
        program_id,
    )
}

/// Derive market PDA
pub fn derive_market(program_id: &Pubkey, market_id: &[u8; 32]) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[PROGRAM_SEED_PREFIX, Market::SEED, market_id],
        program_id,
    )
}

/// Derive collateral vault PDA (token account owned by market)
pub fn derive_collateral_vault(
    program_id: &Pubkey, 
    market_id: &[u8; 32]
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[PROGRAM_SEED_PREFIX, Market::COLLATERAL_VAULT_SEED, market_id],
        program_id,
    )
}

/// Derive loan vault PDA (token account owned by market)
pub fn derive_loan_vault(
    program_id: &Pubkey, 
    market_id: &[u8; 32]
) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[PROGRAM_SEED_PREFIX, Market::LOAN_VAULT_SEED, market_id],
        program_id,
    )
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
            owner.as_ref()
        ],
        program_id,
    )
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

/// Derive fee recipient registry PDA
pub fn derive_fee_registry(program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(
        &[PROGRAM_SEED_PREFIX, FeeRecipientRegistry::SEED],
        program_id,
    )
}
```

---

## Market ID Calculation

Market ID is a keccak256 hash of the market parameters, ensuring uniqueness.

```rust
use anchor_lang::solana_program::keccak;

/// Calculate unique market identifier
/// Matches Morpho Blue's Id derivation
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
```

---

## Constants

```rust
/// WAD = 1e18 (standard DeFi fixed-point)
pub const WAD: u128 = 1_000_000_000_000_000_000;

/// Virtual shares for share inflation protection
pub const VIRTUAL_SHARES: u128 = 1_000_000; // 1e6

/// Virtual assets for share inflation protection  
pub const VIRTUAL_ASSETS: u128 = 1;

/// Maximum protocol fee (25% = 2500 basis points)
pub const MAX_FEE: u64 = 2500;

/// Basis points denominator
pub const BPS: u64 = 10_000;

/// Oracle price scale (1e36)
pub const ORACLE_SCALE: u128 = 1_000_000_000_000_000_000_000_000_000_000_000_000;

/// Maximum liquidation incentive factor (115% = 11500 in scaled BPS)
pub const MAX_LIF: u64 = 11_500;

/// LIF cursor (30% = 3000 in scaled BPS)
pub const LIF_CURSOR: u64 = 3_000;

/// Seconds per year for rate conversions
pub const SECONDS_PER_YEAR: u128 = 31_536_000;

/// Maximum value that fits in u64
pub const MAX_U64: u128 = u64::MAX as u128;

/// Flash loan fee (0.05% = 5 basis points) - optional, can be 0
pub const FLASH_LOAN_FEE_BPS: u64 = 5;
```
