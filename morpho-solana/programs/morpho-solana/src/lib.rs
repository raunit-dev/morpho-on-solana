//! Morpho Blue Lending Protocol on Solana
//! 
//! A production-ready port of Morpho Blue's isolated-market lending protocol.
//! 
//! ## Features
//! - Isolated lending markets (one collateral + one loan token per market)
//! - ERC-4626 style share-based accounting with inflation protection
//! - Token-2022 support for both collateral and loan tokens
//! - CEI pattern for re-entrancy protection
//! - Two-step ownership transfer
//! - Protocol and per-market pause controls
//! - Flash loans with lock mechanism
//! - Liquidation with LIF-based incentives and bad debt socialization

use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod math;
pub mod state;
pub mod interfaces;
pub mod instructions;

use instructions::*;

declare_id!("MorphoXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

#[program]
pub mod morpho_solana {
    use super::*;

    // =========================================================================
    // Admin Instructions
    // =========================================================================

    pub fn initialize(
        ctx: Context<Initialize>,
        owner: Pubkey,
        fee_recipient: Pubkey,
    ) -> Result<()> {
        instructions::admin::initialize(ctx, owner, fee_recipient)
    }

    pub fn transfer_ownership(
        ctx: Context<TransferOwnership>,
        new_owner: Pubkey,
    ) -> Result<()> {
        instructions::admin::transfer_ownership(ctx, new_owner)
    }

    pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
        instructions::admin::accept_ownership(ctx)
    }

    pub fn set_fee_recipient(
        ctx: Context<SetFeeRecipient>,
        new_recipient: Pubkey,
    ) -> Result<()> {
        instructions::admin::set_fee_recipient(ctx, new_recipient)
    }

    pub fn set_protocol_paused(ctx: Context<SetProtocolPaused>, paused: bool) -> Result<()> {
        instructions::admin::set_protocol_paused(ctx, paused)
    }

    pub fn set_market_paused(
        ctx: Context<SetMarketPaused>,
        market_id: [u8; 32],
        paused: bool,
    ) -> Result<()> {
        instructions::admin::set_market_paused(ctx, market_id, paused)
    }

    pub fn enable_lltv(ctx: Context<EnableLltv>, lltv: u64) -> Result<()> {
        instructions::admin::enable_lltv(ctx, lltv)
    }

    pub fn enable_irm(ctx: Context<EnableIrm>, irm: Pubkey) -> Result<()> {
        instructions::admin::enable_irm(ctx, irm)
    }

    pub fn set_fee(ctx: Context<SetFee>, market_id: [u8; 32], fee: u64) -> Result<()> {
        instructions::admin::set_fee(ctx, market_id, fee)
    }

    // =========================================================================
    // Market Instructions
    // =========================================================================

    pub fn create_market(
        ctx: Context<CreateMarket>,
        collateral_mint_key: Pubkey,
        loan_mint_key: Pubkey,
        oracle_key: Pubkey,
        irm_key: Pubkey,
        lltv: u64,
    ) -> Result<()> {
        instructions::market::create_market(
            ctx,
            collateral_mint_key,
            loan_mint_key,
            oracle_key,
            irm_key,
            lltv,
        )
    }

    // =========================================================================
    // Position Instructions
    // =========================================================================

    pub fn create_position(ctx: Context<CreatePosition>, market_id: [u8; 32]) -> Result<()> {
        instructions::position::create_position(ctx, market_id)
    }

    pub fn close_position(ctx: Context<ClosePosition>, market_id: [u8; 32]) -> Result<()> {
        instructions::position::close_position(ctx, market_id)
    }

    // =========================================================================
    // Supply Instructions
    // =========================================================================

    pub fn supply(
        ctx: Context<Supply>,
        market_id: [u8; 32],
        assets: u128,
        min_shares: u128,
    ) -> Result<()> {
        instructions::supply::supply(ctx, market_id, assets, min_shares)
    }

    pub fn withdraw(
        ctx: Context<Withdraw>,
        market_id: [u8; 32],
        assets: u128,
        shares: u128,
    ) -> Result<()> {
        instructions::supply::withdraw(ctx, market_id, assets, shares)
    }

    // =========================================================================
    // Collateral Instructions
    // =========================================================================

    pub fn supply_collateral(
        ctx: Context<SupplyCollateral>,
        market_id: [u8; 32],
        amount: u128,
    ) -> Result<()> {
        instructions::borrow::supply_collateral(ctx, market_id, amount)
    }

    pub fn withdraw_collateral(
        ctx: Context<WithdrawCollateral>,
        market_id: [u8; 32],
        amount: u128,
    ) -> Result<()> {
        instructions::borrow::withdraw_collateral(ctx, market_id, amount)
    }

    // =========================================================================
    // Borrow Instructions
    // =========================================================================

    pub fn borrow(
        ctx: Context<Borrow>,
        market_id: [u8; 32],
        assets: u128,
        max_shares: u128,
    ) -> Result<()> {
        instructions::borrow::borrow(ctx, market_id, assets, max_shares)
    }

    pub fn repay(
        ctx: Context<Repay>,
        market_id: [u8; 32],
        assets: u128,
        shares: u128,
    ) -> Result<()> {
        instructions::borrow::repay(ctx, market_id, assets, shares)
    }

    // =========================================================================
    // Liquidation Instructions
    // =========================================================================

    pub fn liquidate(
        ctx: Context<Liquidate>,
        market_id: [u8; 32],
        seized_assets: u128,
    ) -> Result<()> {
        instructions::liquidate::liquidate(ctx, market_id, seized_assets)
    }

    // =========================================================================
    // Flash Loan Instructions
    // =========================================================================

    pub fn flash_loan(
        ctx: Context<FlashLoanStart>,
        market_id: [u8; 32],
        amount: u128,
    ) -> Result<()> {
        instructions::flash_loan::flash_loan(ctx, market_id, amount)
    }

    pub fn flash_loan_start(
        ctx: Context<FlashLoanStart>,
        market_id: [u8; 32],
        amount: u128,
    ) -> Result<()> {
        instructions::flash_loan::flash_loan_start(ctx, market_id, amount)
    }

    pub fn flash_loan_end(
        ctx: Context<FlashLoanEnd>,
        market_id: [u8; 32],
        borrowed_amount: u128,
    ) -> Result<()> {
        instructions::flash_loan::flash_loan_end(ctx, market_id, borrowed_amount)
    }

    // =========================================================================
    // Utility Instructions
    // =========================================================================

    pub fn accrue_interest(ctx: Context<AccrueInterest>, market_id: [u8; 32]) -> Result<()> {
        instructions::utils::accrue_interest_ix(ctx, market_id)
    }

    pub fn set_authorization(
        ctx: Context<SetAuthorization>,
        is_authorized: bool,
        expires_at: i64,
    ) -> Result<()> {
        instructions::utils::set_authorization(ctx, is_authorized, expires_at)
    }

    pub fn revoke_authorization(ctx: Context<RevokeAuthorization>) -> Result<()> {
        instructions::utils::revoke_authorization(ctx)
    }

    pub fn claim_fees(ctx: Context<ClaimFees>, market_id: [u8; 32]) -> Result<()> {
        instructions::utils::claim_fees(ctx, market_id)
    }
}
