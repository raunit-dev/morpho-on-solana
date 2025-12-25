use anchor_lang::prelude::*;

// === Protocol Events ===

#[event]
pub struct ProtocolInitialized {
    pub owner: Pubkey,
    pub fee_recipient: Pubkey,
}

#[event]
pub struct OwnershipTransferStarted {
    pub current_owner: Pubkey,
    pub pending_owner: Pubkey,
}

#[event]
pub struct OwnershipTransferred {
    pub previous_owner: Pubkey,
    pub new_owner: Pubkey,
}

#[event]
pub struct FeeRecipientSet {
    pub old_recipient: Pubkey,
    pub new_recipient: Pubkey,
}

#[event]
pub struct ProtocolPausedSet {
    pub paused: bool,
}

#[event]
pub struct LltvEnabled {
    pub lltv: u64,
}

#[event]
pub struct IrmEnabled {
    pub irm: Pubkey,
}

// === Market Events ===

#[event]
pub struct MarketCreated {
    pub market_id: [u8; 32],
    pub collateral_mint: Pubkey,
    pub loan_mint: Pubkey,
    pub oracle: Pubkey,
    pub irm: Pubkey,
    pub lltv: u64,
}

#[event]
pub struct MarketPausedSet {
    pub market_id: [u8; 32],
    pub paused: bool,
}

#[event]
pub struct FeeSet {
    pub market_id: [u8; 32],
    pub fee: u64,
}

// === Position Events ===

#[event]
pub struct PositionCreated {
    pub market_id: [u8; 32],
    pub owner: Pubkey,
}

#[event]
pub struct PositionClosed {
    pub market_id: [u8; 32],
    pub owner: Pubkey,
}

// === Supply Events ===

#[event]
pub struct Supply {
    pub market_id: [u8; 32],
    pub supplier: Pubkey,
    pub on_behalf_of: Pubkey,
    pub assets: u128,
    pub shares: u128,
}

#[event]
pub struct Withdraw {
    pub market_id: [u8; 32],
    pub caller: Pubkey,
    pub on_behalf_of: Pubkey,
    pub receiver: Pubkey,
    pub assets: u128,
    pub shares: u128,
}

// === Collateral Events ===

#[event]
pub struct SupplyCollateral {
    pub market_id: [u8; 32],
    pub depositor: Pubkey,
    pub on_behalf_of: Pubkey,
    pub amount: u128,
}

#[event]
pub struct WithdrawCollateral {
    pub market_id: [u8; 32],
    pub caller: Pubkey,
    pub on_behalf_of: Pubkey,
    pub receiver: Pubkey,
    pub amount: u128,
}

// === Borrow Events ===

#[event]
pub struct Borrow {
    pub market_id: [u8; 32],
    pub caller: Pubkey,
    pub on_behalf_of: Pubkey,
    pub receiver: Pubkey,
    pub assets: u128,
    pub shares: u128,
}

#[event]
pub struct Repay {
    pub market_id: [u8; 32],
    pub repayer: Pubkey,
    pub on_behalf_of: Pubkey,
    pub assets: u128,
    pub shares: u128,
}

// === Liquidation Events ===

#[event]
pub struct Liquidation {
    pub market_id: [u8; 32],
    pub liquidator: Pubkey,
    pub borrower: Pubkey,
    pub repaid_assets: u128,
    pub repaid_shares: u128,
    pub seized_collateral: u128,
}

#[event]
pub struct BadDebtRealized {
    pub market_id: [u8; 32],
    pub borrower: Pubkey,
    pub bad_debt_assets: u128,
    pub bad_debt_shares: u128,
}

// === Interest Events ===

#[event]
pub struct InterestAccrued {
    pub market_id: [u8; 32],
    pub interest: u128,
    pub fee_shares: u128,
    pub total_supply_assets: u128,
    pub total_borrow_assets: u128,
}

// === Fee Events ===

#[event]
pub struct FeesClaimed {
    pub market_id: [u8; 32],
    pub recipient: Pubkey,
    pub shares: u128,
}

// === Flash Loan Events ===

#[event]
pub struct FlashLoan {
    pub market_id: [u8; 32],
    pub borrower: Pubkey,
    pub amount: u128,
    pub fee: u128,
}

// === Authorization Events ===

#[event]
pub struct AuthorizationSet {
    pub authorizer: Pubkey,
    pub authorized: Pubkey,
    pub is_authorized: bool,
    pub expires_at: i64,
}

#[event]
pub struct AuthorizationRevoked {
    pub authorizer: Pubkey,
    pub authorized: Pubkey,
}
