//! Admin instructions for protocol management
//! 
//! - Initialize protocol
//! - Two-step ownership transfer
//! - Pause controls
//! - Enable LLTVs and IRMs
//! - Set fees

use anchor_lang::prelude::*;
use crate::constants::{PROGRAM_SEED_PREFIX, BPS, MAX_FEE};
use crate::errors::MorphoError;
use crate::events::*;
use crate::state::{ProtocolState, Market};

// ============================================================================
// Initialize
// ============================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = ProtocolState::space(),
        seeds = [PROGRAM_SEED_PREFIX, ProtocolState::SEED],
        bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    pub system_program: Program<'info, System>,
}

pub fn initialize(
    ctx: Context<Initialize>,
    owner: Pubkey,
    fee_recipient: Pubkey,
) -> Result<()> {
    let state = &mut ctx.accounts.protocol_state;
    state.bump = ctx.bumps.protocol_state;
    state.owner = owner;
    state.pending_owner = Pubkey::default();
    state.fee_recipient = fee_recipient;
    state.paused = false;
    state.lltv_count = 0;
    state.irm_count = 0;
    state.market_count = 0;

    emit!(ProtocolInitialized { owner, fee_recipient });
    Ok(())
}

// ============================================================================
// Ownership Transfer (Two-Step)
// ============================================================================

#[derive(Accounts)]
pub struct TransferOwnership<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, ProtocolState::SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.owner == owner.key() @ MorphoError::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

pub fn transfer_ownership(ctx: Context<TransferOwnership>, new_owner: Pubkey) -> Result<()> {
    ctx.accounts.protocol_state.pending_owner = new_owner;

    emit!(OwnershipTransferStarted {
        current_owner: ctx.accounts.owner.key(),
        pending_owner: new_owner,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AcceptOwnership<'info> {
    pub pending_owner: Signer<'info>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, ProtocolState::SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.pending_owner == pending_owner.key() @ MorphoError::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

pub fn accept_ownership(ctx: Context<AcceptOwnership>) -> Result<()> {
    let state = &mut ctx.accounts.protocol_state;
    let previous_owner = state.owner;

    state.owner = state.pending_owner;
    state.pending_owner = Pubkey::default();

    emit!(OwnershipTransferred {
        previous_owner,
        new_owner: state.owner,
    });
    Ok(())
}

// ============================================================================
// Fee Recipient
// ============================================================================

#[derive(Accounts)]
pub struct SetFeeRecipient<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, ProtocolState::SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.owner == owner.key() @ MorphoError::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

pub fn set_fee_recipient(ctx: Context<SetFeeRecipient>, new_recipient: Pubkey) -> Result<()> {
    let old_recipient = ctx.accounts.protocol_state.fee_recipient;
    ctx.accounts.protocol_state.fee_recipient = new_recipient;

    emit!(FeeRecipientSet {
        old_recipient,
        new_recipient,
    });
    Ok(())
}

// ============================================================================
// Pause Controls
// ============================================================================

#[derive(Accounts)]
pub struct SetProtocolPaused<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, ProtocolState::SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.owner == owner.key() @ MorphoError::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

pub fn set_protocol_paused(ctx: Context<SetProtocolPaused>, paused: bool) -> Result<()> {
    ctx.accounts.protocol_state.paused = paused;
    emit!(ProtocolPausedSet { paused });
    Ok(())
}

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct SetMarketPaused<'info> {
    pub owner: Signer<'info>,

    #[account(
        seeds = [PROGRAM_SEED_PREFIX, ProtocolState::SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.owner == owner.key() @ MorphoError::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, Market::SEED, &market_id],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
}

pub fn set_market_paused(
    ctx: Context<SetMarketPaused>,
    market_id: [u8; 32],
    paused: bool,
) -> Result<()> {
    ctx.accounts.market.paused = paused;
    emit!(MarketPausedSet { market_id, paused });
    Ok(())
}

// ============================================================================
// Enable LLTV / IRM
// ============================================================================

#[derive(Accounts)]
pub struct EnableLltv<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, ProtocolState::SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.owner == owner.key() @ MorphoError::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

pub fn enable_lltv(ctx: Context<EnableLltv>, lltv: u64) -> Result<()> {
    require!(lltv > 0 && lltv <= BPS, MorphoError::InvalidLltv);
    ctx.accounts.protocol_state.add_lltv(lltv)?;
    emit!(LltvEnabled { lltv });
    Ok(())
}

#[derive(Accounts)]
pub struct EnableIrm<'info> {
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, ProtocolState::SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.owner == owner.key() @ MorphoError::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,
}

pub fn enable_irm(ctx: Context<EnableIrm>, irm: Pubkey) -> Result<()> {
    ctx.accounts.protocol_state.add_irm(irm)?;
    emit!(IrmEnabled { irm });
    Ok(())
}

// ============================================================================
// Set Fee
// ============================================================================

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct SetFee<'info> {
    pub owner: Signer<'info>,

    #[account(
        seeds = [PROGRAM_SEED_PREFIX, ProtocolState::SEED],
        bump = protocol_state.bump,
        constraint = protocol_state.owner == owner.key() @ MorphoError::Unauthorized,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, Market::SEED, &market_id],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
}

pub fn set_fee(ctx: Context<SetFee>, market_id: [u8; 32], fee: u64) -> Result<()> {
    require!(fee <= MAX_FEE, MorphoError::FeeTooHigh);
    ctx.accounts.market.fee = fee;
    emit!(FeeSet { market_id, fee });
    Ok(())
}
