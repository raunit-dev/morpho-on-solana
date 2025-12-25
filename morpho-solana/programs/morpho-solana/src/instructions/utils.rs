//! Utility instructions (accrue interest, set authorization, claim fees)

use anchor_lang::prelude::*;
use crate::constants::PROGRAM_SEED_PREFIX;
use crate::errors::MorphoError;
use crate::events::{InterestAccrued, AuthorizationSet, AuthorizationRevoked, FeesClaimed};
use crate::state::{ProtocolState, Market, Position, Authorization};
use crate::math::{checked_add, accrue_interest_on_market};
use crate::interfaces::get_borrow_rate_internal;

// ============================================================================
// Accrue Interest (Public)
// ============================================================================

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct AccrueInterest<'info> {
    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, Market::SEED, &market_id],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
}

pub fn accrue_interest_ix(ctx: Context<AccrueInterest>, market_id: [u8; 32]) -> Result<()> {
    let borrow_rate = get_borrow_rate_internal(
        ctx.accounts.market.total_supply_assets,
        ctx.accounts.market.total_borrow_assets,
    )?;
    let current_time = Clock::get()?.unix_timestamp;

    let market = &mut ctx.accounts.market;
    let result = accrue_interest_on_market(market, current_time, borrow_rate)?;

    emit!(InterestAccrued {
        market_id,
        interest: result.interest,
        fee_shares: result.fee_shares,
        total_supply_assets: market.total_supply_assets,
        total_borrow_assets: market.total_borrow_assets,
    });

    Ok(())
}

// ============================================================================
// Set Authorization
// ============================================================================

#[derive(Accounts)]
pub struct SetAuthorization<'info> {
    #[account(mut)]
    pub authorizer: Signer<'info>,

    /// CHECK: Account to authorize
    pub authorized: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = authorizer,
        space = Authorization::space(),
        seeds = [
            PROGRAM_SEED_PREFIX,
            Authorization::SEED,
            authorizer.key().as_ref(),
            authorized.key().as_ref(),
        ],
        bump,
    )]
    pub authorization: Account<'info, Authorization>,

    pub system_program: Program<'info, System>,
}

pub fn set_authorization(
    ctx: Context<SetAuthorization>,
    is_authorized: bool,
    expires_at: i64,
) -> Result<()> {
    let auth = &mut ctx.accounts.authorization;
    
    // If revoked, cannot be re-enabled
    require!(!auth.is_revoked, MorphoError::AuthorizationRevoked);

    auth.bump = ctx.bumps.authorization;
    auth.authorizer = ctx.accounts.authorizer.key();
    auth.authorized = ctx.accounts.authorized.key();
    auth.is_authorized = is_authorized;
    auth.expires_at = expires_at;

    emit!(AuthorizationSet {
        authorizer: auth.authorizer,
        authorized: auth.authorized,
        is_authorized,
        expires_at,
    });

    Ok(())
}

// ============================================================================
// Revoke Authorization
// ============================================================================

#[derive(Accounts)]
pub struct RevokeAuthorization<'info> {
    pub authorizer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            PROGRAM_SEED_PREFIX,
            Authorization::SEED,
            authorizer.key().as_ref(),
            authorization.authorized.as_ref(),
        ],
        bump = authorization.bump,
        constraint = authorization.authorizer == authorizer.key() @ MorphoError::Unauthorized,
    )]
    pub authorization: Account<'info, Authorization>,
}

pub fn revoke_authorization(ctx: Context<RevokeAuthorization>) -> Result<()> {
    let auth = &mut ctx.accounts.authorization;
    let authorized = auth.authorized;
    
    auth.revoke();

    emit!(AuthorizationRevoked {
        authorizer: ctx.accounts.authorizer.key(),
        authorized,
    });

    Ok(())
}

// ============================================================================
// Claim Fees
// ============================================================================

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct ClaimFees<'info> {
    #[account(
        seeds = [PROGRAM_SEED_PREFIX, ProtocolState::SEED],
        bump = protocol_state.bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, Market::SEED, &market_id],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [
            PROGRAM_SEED_PREFIX,
            Position::SEED,
            &market_id,
            protocol_state.fee_recipient.as_ref(),
        ],
        bump = fee_position.bump,
    )]
    pub fee_position: Account<'info, Position>,
}

pub fn claim_fees(ctx: Context<ClaimFees>, market_id: [u8; 32]) -> Result<()> {
    let pending = ctx.accounts.market.pending_fee_shares;
    
    if pending == 0 {
        return Ok(());
    }

    // Transfer pending fee shares to fee recipient's position
    ctx.accounts.fee_position.supply_shares = checked_add(
        ctx.accounts.fee_position.supply_shares,
        pending,
    )?;
    ctx.accounts.market.pending_fee_shares = 0;

    emit!(FeesClaimed {
        market_id,
        recipient: ctx.accounts.protocol_state.fee_recipient,
        shares: pending,
    });

    Ok(())
}
