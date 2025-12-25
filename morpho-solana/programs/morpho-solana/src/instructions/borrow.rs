//! Collateral and borrow instructions
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
    to_shares_up, to_shares_down, to_assets_up,
    accrue_interest_on_market,
};
use crate::interfaces::{get_borrow_rate_internal, get_oracle_price_validated, is_liquidatable};

// ============================================================================
// Supply Collateral
// ============================================================================

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct SupplyCollateral<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        seeds = [PROGRAM_SEED_PREFIX, ProtocolState::SEED],
        bump = protocol_state.bump,
    )]
    pub protocol_state: Account<'info, ProtocolState>,

    #[account(
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

    /// CHECK: Position owner
    pub on_behalf_of: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = depositor_token_account.mint == market.collateral_mint,
    )]
    pub depositor_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, Market::COLLATERAL_VAULT_SEED, &market_id],
        bump = market.collateral_vault_bump,
    )]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,

    pub collateral_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn supply_collateral(
    ctx: Context<SupplyCollateral>,
    market_id: [u8; 32],
    amount: u128,
) -> Result<()> {
    // ===== CHECKS =====
    require!(!ctx.accounts.protocol_state.paused, MorphoError::ProtocolPaused);
    require!(!ctx.accounts.market.paused, MorphoError::MarketPaused);
    require!(amount > 0, MorphoError::ZeroAmount);

    // ===== EFFECTS =====
    ctx.accounts.position.collateral = checked_add(ctx.accounts.position.collateral, amount)?;

    // ===== INTERACTIONS =====
    let amount_u64 = safe_u128_to_u64(amount)?;
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.depositor_token_account.to_account_info(),
                to: ctx.accounts.collateral_vault.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
                mint: ctx.accounts.collateral_mint.to_account_info(),
            },
        ),
        amount_u64,
        ctx.accounts.collateral_mint.decimals,
    )?;

    emit!(events::SupplyCollateral {
        market_id,
        depositor: ctx.accounts.depositor.key(),
        on_behalf_of: ctx.accounts.on_behalf_of.key(),
        amount,
    });

    Ok(())
}

// ============================================================================
// Withdraw Collateral
// ============================================================================

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct WithdrawCollateral<'info> {
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

    pub authorization: Option<Account<'info, Authorization>>,

    /// CHECK: Oracle account for health check
    pub oracle: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = receiver_token_account.mint == market.collateral_mint,
    )]
    pub receiver_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, Market::COLLATERAL_VAULT_SEED, &market_id],
        bump = market.collateral_vault_bump,
    )]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,

    pub collateral_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn withdraw_collateral(
    ctx: Context<WithdrawCollateral>,
    market_id: [u8; 32],
    amount: u128,
) -> Result<()> {
    // ===== CHECKS =====
    require!(!ctx.accounts.protocol_state.paused, MorphoError::ProtocolPaused);
    require!(!ctx.accounts.market.paused, MorphoError::MarketPaused);
    require!(amount > 0, MorphoError::ZeroAmount);

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

    require!(
        ctx.accounts.position.collateral >= amount,
        MorphoError::InsufficientCollateral
    );

    // ===== EFFECTS =====
    ctx.accounts.position.collateral = checked_sub(ctx.accounts.position.collateral, amount)?;

    // Health check AFTER effect, BEFORE interaction
    if ctx.accounts.position.borrow_shares > 0 {
        let oracle_price = get_oracle_price_validated(
            &ctx.accounts.oracle.to_account_info(),
            market,
        )?;
        require!(
            !is_liquidatable(
                ctx.accounts.position.collateral,
                ctx.accounts.position.borrow_shares,
                market.total_borrow_assets,
                market.total_borrow_shares,
                oracle_price,
                market.lltv,
            )?,
            MorphoError::PositionUnhealthy
        );
    }

    // ===== INTERACTIONS =====
    let amount_u64 = safe_u128_to_u64(amount)?;
    let bump = market.bump;
    let seeds = &[
        PROGRAM_SEED_PREFIX,
        Market::SEED,
        market_id.as_ref(),
        &[bump],
    ];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.collateral_vault.to_account_info(),
                to: ctx.accounts.receiver_token_account.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
                mint: ctx.accounts.collateral_mint.to_account_info(),
            },
            &[seeds],
        ),
        amount_u64,
        ctx.accounts.collateral_mint.decimals,
    )?;

    emit!(events::WithdrawCollateral {
        market_id,
        caller: ctx.accounts.caller.key(),
        on_behalf_of: ctx.accounts.position.owner,
        receiver: ctx.accounts.receiver_token_account.key(),
        amount,
    });

    Ok(())
}

// ============================================================================
// Borrow
// ============================================================================

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct Borrow<'info> {
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

    pub authorization: Option<Account<'info, Authorization>>,

    /// CHECK: Oracle account for health check
    pub oracle: UncheckedAccount<'info>,

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

pub fn borrow(
    ctx: Context<Borrow>,
    market_id: [u8; 32],
    assets: u128,
    max_shares: u128,
) -> Result<()> {
    // ===== CHECKS =====
    require!(!ctx.accounts.protocol_state.paused, MorphoError::ProtocolPaused);
    require!(!ctx.accounts.market.paused, MorphoError::MarketPaused);
    require!(assets > 0, MorphoError::ZeroAmount);

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

    require!(
        assets <= market.available_liquidity(),
        MorphoError::InsufficientLiquidity
    );

    // Calculate shares (round UP - user owes more)
    let shares = to_shares_up(assets, market.total_borrow_assets, market.total_borrow_shares)?;
    if max_shares > 0 {
        require!(shares <= max_shares, MorphoError::SlippageExceeded);
    }

    // ===== EFFECTS =====
    ctx.accounts.position.borrow_shares = checked_add(ctx.accounts.position.borrow_shares, shares)?;
    market.total_borrow_assets = checked_add(market.total_borrow_assets, assets)?;
    market.total_borrow_shares = checked_add(market.total_borrow_shares, shares)?;

    // Health check AFTER effect
    let oracle_price = get_oracle_price_validated(
        &ctx.accounts.oracle.to_account_info(),
        market,
    )?;
    require!(
        !is_liquidatable(
            ctx.accounts.position.collateral,
            ctx.accounts.position.borrow_shares,
            market.total_borrow_assets,
            market.total_borrow_shares,
            oracle_price,
            market.lltv,
        )?,
        MorphoError::PositionUnhealthy
    );

    // ===== INTERACTIONS =====
    let amount_u64 = safe_u128_to_u64(assets)?;
    let bump = market.bump;
    let seeds = &[
        PROGRAM_SEED_PREFIX,
        Market::SEED,
        market_id.as_ref(),
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

    emit!(events::Borrow {
        market_id,
        caller: ctx.accounts.caller.key(),
        on_behalf_of: ctx.accounts.position.owner,
        receiver: ctx.accounts.receiver_token_account.key(),
        assets,
        shares,
    });

    Ok(())
}

// ============================================================================
// Repay
// ============================================================================

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct Repay<'info> {
    #[account(mut)]
    pub repayer: Signer<'info>,

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

    /// CHECK: Position owner
    pub on_behalf_of: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = repayer_token_account.mint == market.loan_mint,
    )]
    pub repayer_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, Market::LOAN_VAULT_SEED, &market_id],
        bump = market.loan_vault_bump,
    )]
    pub loan_vault: InterfaceAccount<'info, TokenAccount>,

    pub loan_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn repay(
    ctx: Context<Repay>,
    market_id: [u8; 32],
    assets: u128,
    shares: u128,
) -> Result<()> {
    // ===== CHECKS =====
    // Note: Repay allowed even when paused (helps users exit)
    require!(assets > 0 || shares > 0, MorphoError::ZeroAmount);
    require!(!(assets > 0 && shares > 0), MorphoError::InvalidInput);

    // Accrue interest
    let borrow_rate = get_borrow_rate_internal(
        ctx.accounts.market.total_supply_assets,
        ctx.accounts.market.total_borrow_assets,
    )?;
    let current_time = Clock::get()?.unix_timestamp;
    
    let market = &mut ctx.accounts.market;
    accrue_interest_on_market(market, current_time, borrow_rate)?;

    let position = &ctx.accounts.position;

    // Calculate amounts
    let (repay_assets, burn_shares) = if assets > 0 {
        let s = to_shares_down(assets, market.total_borrow_assets, market.total_borrow_shares)?;
        let s = std::cmp::min(s, position.borrow_shares);
        let a = to_assets_up(s, market.total_borrow_assets, market.total_borrow_shares)?;
        (a, s)
    } else {
        let s = std::cmp::min(shares, position.borrow_shares);
        let a = to_assets_up(s, market.total_borrow_assets, market.total_borrow_shares)?;
        (a, s)
    };

    require!(burn_shares > 0, MorphoError::ZeroAmount);

    // ===== EFFECTS =====
    ctx.accounts.position.borrow_shares = checked_sub(ctx.accounts.position.borrow_shares, burn_shares)?;
    market.total_borrow_assets = checked_sub(market.total_borrow_assets, repay_assets)?;
    market.total_borrow_shares = checked_sub(market.total_borrow_shares, burn_shares)?;

    // ===== INTERACTIONS =====
    let amount_u64 = safe_u128_to_u64(repay_assets)?;
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.repayer_token_account.to_account_info(),
                to: ctx.accounts.loan_vault.to_account_info(),
                authority: ctx.accounts.repayer.to_account_info(),
                mint: ctx.accounts.loan_mint.to_account_info(),
            },
        ),
        amount_u64,
        ctx.accounts.loan_mint.decimals,
    )?;

    emit!(events::Repay {
        market_id,
        repayer: ctx.accounts.repayer.key(),
        on_behalf_of: ctx.accounts.on_behalf_of.key(),
        assets: repay_assets,
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
