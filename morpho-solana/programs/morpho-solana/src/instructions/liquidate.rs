//! Liquidation instruction

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, transfer_checked, TransferChecked};
use crate::constants::PROGRAM_SEED_PREFIX;
use crate::errors::MorphoError;
use crate::events::{Liquidation, BadDebtRealized};
use crate::state::{Market, Position};
use crate::math::{
    checked_sub, safe_u128_to_u64,
    to_shares_down, to_assets_up,
    accrue_interest_on_market,
};
use crate::interfaces::{
    get_borrow_rate_internal, get_oracle_price_validated, 
    is_liquidatable, calculate_lif, calculate_seized_collateral, socialize_bad_debt,
};

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub liquidator: Signer<'info>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, Market::SEED, &market_id],
        bump = market.bump,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, Position::SEED, &market_id, borrower.key().as_ref()],
        bump = borrower_position.bump,
    )]
    pub borrower_position: Box<Account<'info, Position>>,

    /// CHECK: Borrower being liquidated
    pub borrower: UncheckedAccount<'info>,

    /// CHECK: Oracle for price
    pub oracle: UncheckedAccount<'info>,

    #[account(
        mut,
        constraint = liquidator_loan_account.mint == market.loan_mint,
    )]
    pub liquidator_loan_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        constraint = liquidator_collateral_account.mint == market.collateral_mint,
    )]
    pub liquidator_collateral_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, Market::LOAN_VAULT_SEED, &market_id],
        bump = market.loan_vault_bump,
    )]
    pub loan_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, Market::COLLATERAL_VAULT_SEED, &market_id],
        bump = market.collateral_vault_bump,
    )]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,

    pub loan_mint: InterfaceAccount<'info, Mint>,
    pub collateral_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn liquidate(
    ctx: Context<Liquidate>,
    market_id: [u8; 32],
    seized_assets: u128,  // Amount of loan tokens the liquidator wants to repay
) -> Result<()> {
    // ===== CHECKS =====
    // Note: Liquidation allowed even when paused (maintains protocol health)
    require!(seized_assets > 0, MorphoError::ZeroAmount);

    // Accrue interest
    let borrow_rate = get_borrow_rate_internal(
        ctx.accounts.market.total_supply_assets,
        ctx.accounts.market.total_borrow_assets,
    )?;
    let current_time = Clock::get()?.unix_timestamp;
    
    let market = &mut ctx.accounts.market;
    accrue_interest_on_market(market, current_time, borrow_rate)?;

    let position = &ctx.accounts.borrower_position;

    // Get validated oracle price
    let oracle_price = get_oracle_price_validated(
        &ctx.accounts.oracle.to_account_info(),
        market,
    )?;

    // Verify position is liquidatable
    require!(
        is_liquidatable(
            position.collateral,
            position.borrow_shares,
            market.total_borrow_assets,
            market.total_borrow_shares,
            oracle_price,
            market.lltv,
        )?,
        MorphoError::PositionHealthy
    );

    // Calculate liquidation incentive and seized collateral
    let lif = calculate_lif(market.lltv);
    let seized_collateral = calculate_seized_collateral(seized_assets, oracle_price, lif)?;
    let seized_collateral = std::cmp::min(seized_collateral, position.collateral);

    // Calculate repaid shares
    let repaid_shares = to_shares_down(seized_assets, market.total_borrow_assets, market.total_borrow_shares)?;
    let repaid_shares = std::cmp::min(repaid_shares, position.borrow_shares);
    let actual_seized_assets = to_assets_up(repaid_shares, market.total_borrow_assets, market.total_borrow_shares)?;

    // ===== EFFECTS =====
    let position = &mut ctx.accounts.borrower_position;
    position.borrow_shares = checked_sub(position.borrow_shares, repaid_shares)?;
    position.collateral = checked_sub(position.collateral, seized_collateral)?;

    market.total_borrow_shares = checked_sub(market.total_borrow_shares, repaid_shares)?;
    market.total_borrow_assets = checked_sub(market.total_borrow_assets, actual_seized_assets)?;

    // Bad debt handling: if no collateral left but still has debt
    if position.collateral == 0 && position.borrow_shares > 0 {
        let remaining_shares = position.borrow_shares;
        let bad_debt = socialize_bad_debt(market, remaining_shares)?;
        position.borrow_shares = 0;

        emit!(BadDebtRealized {
            market_id,
            borrower: ctx.accounts.borrower.key(),
            bad_debt_assets: bad_debt,
            bad_debt_shares: remaining_shares,
        });
    }

    // ===== INTERACTIONS =====
    // Liquidator repays loan tokens
    let repay_amount = safe_u128_to_u64(actual_seized_assets)?;
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.liquidator_loan_account.to_account_info(),
                to: ctx.accounts.loan_vault.to_account_info(),
                authority: ctx.accounts.liquidator.to_account_info(),
                mint: ctx.accounts.loan_mint.to_account_info(),
            },
        ),
        repay_amount,
        ctx.accounts.loan_mint.decimals,
    )?;

    // Liquidator receives collateral
    let collateral_amount = safe_u128_to_u64(seized_collateral)?;
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
                to: ctx.accounts.liquidator_collateral_account.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
                mint: ctx.accounts.collateral_mint.to_account_info(),
            },
            &[seeds],
        ),
        collateral_amount,
        ctx.accounts.collateral_mint.decimals,
    )?;

    emit!(Liquidation {
        market_id,
        liquidator: ctx.accounts.liquidator.key(),
        borrower: ctx.accounts.borrower.key(),
        repaid_assets: actual_seized_assets,
        repaid_shares,
        seized_collateral,
    });

    Ok(())
}
