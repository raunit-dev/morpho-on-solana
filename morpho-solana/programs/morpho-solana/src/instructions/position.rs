//! Position management instructions (create, close)

use anchor_lang::prelude::*;
use crate::constants::PROGRAM_SEED_PREFIX;
use crate::errors::MorphoError;
use crate::events::{PositionCreated, PositionClosed};
use crate::state::{Market, Position};

// ============================================================================
// Create Position
// ============================================================================

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct CreatePosition<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Position owner - can be any account
    pub owner: UncheckedAccount<'info>,

    #[account(
        seeds = [PROGRAM_SEED_PREFIX, Market::SEED, &market_id],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        init,
        payer = payer,
        space = Position::space(),
        seeds = [PROGRAM_SEED_PREFIX, Position::SEED, &market_id, owner.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,

    pub system_program: Program<'info, System>,
}

pub fn create_position(ctx: Context<CreatePosition>, market_id: [u8; 32]) -> Result<()> {
    let position = &mut ctx.accounts.position;
    position.bump = ctx.bumps.position;
    position.market_id = market_id;
    position.owner = ctx.accounts.owner.key();
    position.supply_shares = 0;
    position.borrow_shares = 0;
    position.collateral = 0;

    emit!(PositionCreated {
        market_id,
        owner: position.owner,
    });
    Ok(())
}

// ============================================================================
// Close Position
// ============================================================================

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct ClosePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: Rent receiver - can be any account
    #[account(mut)]
    pub rent_receiver: UncheckedAccount<'info>,

    #[account(
        mut,
        close = rent_receiver,
        seeds = [PROGRAM_SEED_PREFIX, Position::SEED, &market_id, owner.key().as_ref()],
        bump = position.bump,
        constraint = position.owner == owner.key() @ MorphoError::Unauthorized,
        constraint = position.can_close() @ MorphoError::PositionNotEmpty,
    )]
    pub position: Account<'info, Position>,
}

pub fn close_position(ctx: Context<ClosePosition>, market_id: [u8; 32]) -> Result<()> {
    emit!(PositionClosed {
        market_id,
        owner: ctx.accounts.owner.key(),
    });
    Ok(())
}
