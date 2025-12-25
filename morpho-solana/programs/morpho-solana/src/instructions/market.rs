//! Market creation instruction

use anchor_lang::prelude::*;
use anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface};
use crate::constants::PROGRAM_SEED_PREFIX;
use crate::errors::MorphoError;
use crate::events::MarketCreated;
use crate::state::{ProtocolState, Market, calculate_market_id};

#[derive(Accounts)]
#[instruction(
    collateral_mint_key: Pubkey,
    loan_mint_key: Pubkey,
    oracle_key: Pubkey,
    irm_key: Pubkey,
    lltv: u64,
)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        mut,
        seeds = [PROGRAM_SEED_PREFIX, ProtocolState::SEED],
        bump = protocol_state.bump,
    )]
    pub protocol_state: Box<Account<'info, ProtocolState>>,

    #[account(
        init,
        payer = creator,
        space = Market::space(),
        seeds = [
            PROGRAM_SEED_PREFIX,
            Market::SEED,
            &calculate_market_id(&collateral_mint_key, &loan_mint_key, &oracle_key, &irm_key, lltv),
        ],
        bump,
    )]
    pub market: Box<Account<'info, Market>>,

    #[account(constraint = collateral_mint.key() == collateral_mint_key)]
    pub collateral_mint: InterfaceAccount<'info, Mint>,

    #[account(constraint = loan_mint.key() == loan_mint_key)]
    pub loan_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = creator,
        token::mint = collateral_mint,
        token::authority = market,
        seeds = [
            PROGRAM_SEED_PREFIX,
            Market::COLLATERAL_VAULT_SEED,
            &calculate_market_id(&collateral_mint_key, &loan_mint_key, &oracle_key, &irm_key, lltv),
        ],
        bump,
    )]
    pub collateral_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        init,
        payer = creator,
        token::mint = loan_mint,
        token::authority = market,
        seeds = [
            PROGRAM_SEED_PREFIX,
            Market::LOAN_VAULT_SEED,
            &calculate_market_id(&collateral_mint_key, &loan_mint_key, &oracle_key, &irm_key, lltv),
        ],
        bump,
    )]
    pub loan_vault: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Oracle - validated by creator, will be used for price feeds
    #[account(constraint = oracle.key() == oracle_key)]
    pub oracle: UncheckedAccount<'info>,

    /// CHECK: IRM - must be whitelisted in protocol_state
    #[account(constraint = irm.key() == irm_key)]
    pub irm: UncheckedAccount<'info>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn create_market(
    ctx: Context<CreateMarket>,
    collateral_mint_key: Pubkey,
    loan_mint_key: Pubkey,
    oracle_key: Pubkey,
    irm_key: Pubkey,
    lltv: u64,
) -> Result<()> {
    let state = &ctx.accounts.protocol_state;

    // Validate LLTV and IRM are whitelisted
    require!(state.is_lltv_enabled(lltv), MorphoError::LltvNotEnabled);
    require!(state.is_irm_enabled(&irm_key), MorphoError::IrmNotEnabled);

    let market_id = calculate_market_id(
        &collateral_mint_key,
        &loan_mint_key,
        &oracle_key,
        &irm_key,
        lltv,
    );

    let market = &mut ctx.accounts.market;
    market.bump = ctx.bumps.market;
    market.market_id = market_id;
    market.collateral_mint = collateral_mint_key;
    market.loan_mint = loan_mint_key;
    market.collateral_decimals = ctx.accounts.collateral_mint.decimals;
    market.loan_decimals = ctx.accounts.loan_mint.decimals;
    market.oracle = oracle_key;
    market.irm = irm_key;
    market.lltv = lltv;
    market.paused = false;
    market.fee = 0;
    market.total_supply_assets = 0;
    market.total_supply_shares = 0;
    market.total_borrow_assets = 0;
    market.total_borrow_shares = 0;
    market.last_update = Clock::get()?.unix_timestamp;
    market.pending_fee_shares = 0;
    market.collateral_vault_bump = ctx.bumps.collateral_vault;
    market.loan_vault_bump = ctx.bumps.loan_vault;
    market.flash_loan_lock = 0;

    ctx.accounts.protocol_state.market_count += 1;

    emit!(MarketCreated {
        market_id,
        collateral_mint: market.collateral_mint,
        loan_mint: market.loan_mint,
        oracle: market.oracle,
        irm: market.irm,
        lltv: market.lltv,
    });

    Ok(())
}
