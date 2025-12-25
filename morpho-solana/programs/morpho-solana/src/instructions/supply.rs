//! Supply and withdraw instructions
//! 
//! CEI Pattern: Checks → Effects → Interactions

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, transfer_checked, TransferChecked};
use crate::constants::PROGRAM_SEED_PREFIX;
use crate::errors::MorphoError;
use crate::events;
use crate::state::{ProtocolState, Market, Position, Authorization};
use crate::math::{
    checked_add, checked_sub, safe_u128_to_u64,
    to_shares_down, to_shares_up, to_assets_down,
    accrue_interest_on_market,
};
use crate::interfaces::get_borrow_rate_internal;

// ============================================================================
// Supply
// ============================================================================

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct Supply<'info> {
    #[account(mut)]
    pub supplier: Signer<'info>,

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
        seeds = [PROGRAM_SEED_PREFIX, Position::SEED, &market_id, on_behalf_of.key().as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, Position>,

    /// CHECK: Position owner - shares credited to this account's position
    pub on_behalf_of: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = supplier_token_account.mint == market.loan_mint,
    )]
    pub supplier_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, Market::LOAN_VAULT_SEED, &market_id],
        bump = market.loan_vault_bump,
    )]
    pub loan_vault: InterfaceAccount<'info, TokenAccount>,

    pub loan_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn supply(
    ctx: Context<Supply>,
    market_id: [u8; 32],
    assets: u128,
    min_shares: u128,
) -> Result<()> {
    // ===== CHECKS =====
    require!(!ctx.accounts.protocol_state.paused, MorphoError::ProtocolPaused);
    require!(!ctx.accounts.market.paused, MorphoError::MarketPaused);
    require!(assets > 0, MorphoError::ZeroAmount);

    // Accrue interest
    let borrow_rate = get_borrow_rate_internal(
        ctx.accounts.market.total_supply_assets,
        ctx.accounts.market.total_borrow_assets,
    )?;
    let current_time = Clock::get()?.unix_timestamp;
    
    let market = &mut ctx.accounts.market;
    accrue_interest_on_market(market, current_time, borrow_rate)?;

    // Calculate shares (round DOWN - user gets fewer shares)
    let shares = to_shares_down(
        assets,
        market.total_supply_assets,
        market.total_supply_shares,
    )?;
    require!(shares >= min_shares, MorphoError::SlippageExceeded);

    // ===== EFFECTS =====
    market.total_supply_assets = checked_add(market.total_supply_assets, assets)?;
    market.total_supply_shares = checked_add(market.total_supply_shares, shares)?;
    ctx.accounts.position.supply_shares = checked_add(ctx.accounts.position.supply_shares, shares)?;

    // ===== INTERACTIONS =====
    let amount_u64 = safe_u128_to_u64(assets)?;
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.supplier_token_account.to_account_info(),
                to: ctx.accounts.loan_vault.to_account_info(),
                authority: ctx.accounts.supplier.to_account_info(),
                mint: ctx.accounts.loan_mint.to_account_info(),
            },
        ),
        amount_u64,
        ctx.accounts.loan_mint.decimals,
    )?;

    emit!(events::Supply {
        market_id,
        supplier: ctx.accounts.supplier.key(),
        on_behalf_of: ctx.accounts.on_behalf_of.key(),
        assets,
        shares,
    });

    Ok(())
}

// ============================================================================
// Withdraw
// ============================================================================

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

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
        seeds = [PROGRAM_SEED_PREFIX, Position::SEED, &market_id, position.owner.as_ref()],
        bump = position.bump,
    )]
    pub position: Account<'info, Position>,

    /// Optional authorization account
    pub authorization: Option<Account<'info, Authorization>>,

    #[account(
        mut,
        constraint = receiver_token_account.mint == market.loan_mint,
    )]
    pub receiver_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, Market::LOAN_VAULT_SEED, &market_id],
        bump = market.loan_vault_bump,
    )]
    pub loan_vault: InterfaceAccount<'info, TokenAccount>,

    pub loan_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn withdraw(
    ctx: Context<Withdraw>,
    market_id: [u8; 32],
    assets: u128,
    shares: u128,
) -> Result<()> {
    // ===== CHECKS =====
    require!(!ctx.accounts.protocol_state.paused, MorphoError::ProtocolPaused);
    require!(!ctx.accounts.market.paused, MorphoError::MarketPaused);
    require!(assets > 0 || shares > 0, MorphoError::ZeroAmount);
    require!(!(assets > 0 && shares > 0), MorphoError::InvalidInput);

    // Authorization check
    validate_authorization(
        &ctx.accounts.caller,
        &ctx.accounts.position.owner,
        ctx.accounts.authorization.as_ref(),
    )?;

    // Accrue interest
    let borrow_rate = get_borrow_rate_internal(
        ctx.accounts.market.total_supply_assets,
        ctx.accounts.market.total_borrow_assets,
    )?;
    let current_time = Clock::get()?.unix_timestamp;
    
    let market = &mut ctx.accounts.market;
    accrue_interest_on_market(market, current_time, borrow_rate)?;

    // Calculate amounts
    let (withdraw_assets, burn_shares) = if assets > 0 {
        let s = to_shares_up(assets, market.total_supply_assets, market.total_supply_shares)?;
        (assets, s)
    } else {
        let a = to_assets_down(shares, market.total_supply_assets, market.total_supply_shares)?;
        (a, shares)
    };

    require!(
        ctx.accounts.position.supply_shares >= burn_shares,
        MorphoError::InsufficientBalance
    );
    require!(
        withdraw_assets <= market.available_liquidity(),
        MorphoError::InsufficientLiquidity
    );

    // ===== EFFECTS =====
    ctx.accounts.position.supply_shares = checked_sub(ctx.accounts.position.supply_shares, burn_shares)?;
    market.total_supply_assets = checked_sub(market.total_supply_assets, withdraw_assets)?;
    market.total_supply_shares = checked_sub(market.total_supply_shares, burn_shares)?;

    // ===== INTERACTIONS =====
    let amount_u64 = safe_u128_to_u64(withdraw_assets)?;
    let market_id_ref = market_id;
    let bump = market.bump;
    let seeds = &[
        PROGRAM_SEED_PREFIX,
        Market::SEED,
        market_id_ref.as_ref(),
        &[bump],
    ];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.loan_vault.to_account_info(),
                to: ctx.accounts.receiver_token_account.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
                mint: ctx.accounts.loan_mint.to_account_info(),
            },
            &[seeds],
        ),
        amount_u64,
        ctx.accounts.loan_mint.decimals,
    )?;

    emit!(events::Withdraw {
        market_id,
        caller: ctx.accounts.caller.key(),
        on_behalf_of: ctx.accounts.position.owner,
        receiver: ctx.accounts.receiver_token_account.key(),
        assets: withdraw_assets,
        shares: burn_shares,
    });

    Ok(())
}

/// Validate authorization for delegated operations
fn validate_authorization(
    caller: &Signer,
    owner: &Pubkey,
    authorization: Option<&Account<Authorization>>,
) -> Result<()> {
    if caller.key() == *owner {
        return Ok(());
    }

    let current_time = Clock::get()?.unix_timestamp;

    if let Some(auth) = authorization {
        if auth.authorizer == *owner
            && auth.authorized == caller.key()
            && auth.is_valid(current_time)
        {
            return Ok(());
        }
    }

    Err(MorphoError::Unauthorized.into())
}
