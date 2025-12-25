//! Flash loan instruction with lock mechanism

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface, transfer_checked, TransferChecked};
use crate::constants::{PROGRAM_SEED_PREFIX, BPS, FLASH_LOAN_FEE_BPS};
use crate::errors::MorphoError;
use crate::events::FlashLoan;
use crate::state::{ProtocolState, Market};
use crate::math::{checked_add, safe_u128_to_u64, mul_div_up};

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct FlashLoanStart<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,

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
        constraint = borrower_token_account.mint == market.loan_mint,
    )]
    pub borrower_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, Market::LOAN_VAULT_SEED, &market_id],
        bump = market.loan_vault_bump,
    )]
    pub loan_vault: InterfaceAccount<'info, TokenAccount>,

    pub loan_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
}

/// Start a flash loan - transfers tokens out and locks the market
pub fn flash_loan_start(
    ctx: Context<FlashLoanStart>,
    market_id: [u8; 32],
    amount: u128,
) -> Result<()> {
    // ===== CHECKS =====
    require!(!ctx.accounts.protocol_state.paused, MorphoError::ProtocolPaused);
    require!(!ctx.accounts.market.paused, MorphoError::MarketPaused);
    require!(amount > 0, MorphoError::ZeroAmount);
    require!(
        amount <= ctx.accounts.market.available_liquidity(),
        MorphoError::InsufficientLiquidity
    );
    require!(
        !ctx.accounts.market.is_flash_loan_active(),
        MorphoError::FlashLoanInProgress
    );

    let market = &mut ctx.accounts.market;
    
    // Set flash loan lock
    market.flash_loan_lock = 1;

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
                from: ctx.accounts.loan_vault.to_account_info(),
                to: ctx.accounts.borrower_token_account.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
                mint: ctx.accounts.loan_mint.to_account_info(),
            },
            &[seeds],
        ),
        amount_u64,
        ctx.accounts.loan_mint.decimals,
    )?;

    Ok(())
}

#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct FlashLoanEnd<'info> {
    #[account(mut)]
    pub borrower: Signer<'info>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, Market::SEED, &market_id],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        constraint = borrower_token_account.mint == market.loan_mint,
    )]
    pub borrower_token_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, Market::LOAN_VAULT_SEED, &market_id],
        bump = market.loan_vault_bump,
    )]
    pub loan_vault: InterfaceAccount<'info, TokenAccount>,

    pub loan_mint: InterfaceAccount<'info, Mint>,

    pub token_program: Interface<'info, TokenInterface>,
}

/// End a flash loan - verifies repayment and unlocks the market
pub fn flash_loan_end(
    ctx: Context<FlashLoanEnd>,
    market_id: [u8; 32],
    borrowed_amount: u128,
) -> Result<()> {
    // ===== CHECKS =====
    require!(
        ctx.accounts.market.is_flash_loan_active(),
        MorphoError::FlashLoanCallbackFailed
    );

    // Calculate required repayment (principal + fee)
    let fee = mul_div_up(borrowed_amount, FLASH_LOAN_FEE_BPS as u128, BPS as u128)?;
    let required_repayment = checked_add(borrowed_amount, fee)?;
    let repayment_u64 = safe_u128_to_u64(required_repayment)?;

    // ===== INTERACTIONS =====
    // Borrower repays loan + fee
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.borrower_token_account.to_account_info(),
                to: ctx.accounts.loan_vault.to_account_info(),
                authority: ctx.accounts.borrower.to_account_info(),
                mint: ctx.accounts.loan_mint.to_account_info(),
            },
        ),
        repayment_u64,
        ctx.accounts.loan_mint.decimals,
    )?;

    // ===== EFFECTS (after successful repayment) =====
    let market = &mut ctx.accounts.market;
    
    // Fee goes to suppliers
    market.total_supply_assets = checked_add(market.total_supply_assets, fee)?;
    
    // Unlock flash loan
    market.flash_loan_lock = 0;

    emit!(FlashLoan {
        market_id,
        borrower: ctx.accounts.borrower.key(),
        amount: borrowed_amount,
        fee,
    });

    Ok(())
}

/// Single-instruction flash loan (for composable transactions)
/// The token repayment must happen atomically within the same transaction
pub fn flash_loan(
    ctx: Context<FlashLoanStart>,
    market_id: [u8; 32],
    amount: u128,
) -> Result<()> {
    require!(!ctx.accounts.protocol_state.paused, MorphoError::ProtocolPaused);
    require!(!ctx.accounts.market.paused, MorphoError::MarketPaused);
    require!(amount > 0, MorphoError::ZeroAmount);
    require!(
        amount <= ctx.accounts.market.available_liquidity(),
        MorphoError::InsufficientLiquidity
    );

    let fee = mul_div_up(amount, FLASH_LOAN_FEE_BPS as u128, BPS as u128)?;
    let vault_before = ctx.accounts.loan_vault.amount;

    // Transfer out
    let amount_u64 = safe_u128_to_u64(amount)?;
    let market = &ctx.accounts.market;
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
                to: ctx.accounts.borrower_token_account.to_account_info(),
                authority: ctx.accounts.market.to_account_info(),
                mint: ctx.accounts.loan_mint.to_account_info(),
            },
            &[seeds],
        ),
        amount_u64,
        ctx.accounts.loan_mint.decimals,
    )?;

    // Reload vault and verify repayment
    ctx.accounts.loan_vault.reload()?;
    let required = checked_add(vault_before as u128, fee)?;
    require!(
        ctx.accounts.loan_vault.amount as u128 >= required,
        MorphoError::FlashLoanNotRepaid
    );

    // Fee to suppliers
    let market = &mut ctx.accounts.market;
    market.total_supply_assets = checked_add(market.total_supply_assets, fee)?;

    emit!(FlashLoan {
        market_id,
        borrower: ctx.accounts.borrower.key(),
        amount,
        fee,
    });

    Ok(())
}
