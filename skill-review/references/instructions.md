# Instructions Reference (v2)

## Table of Contents
1. [Design Principles](#design-principles)
2. [Token Transfer Utilities](#token-transfer-utilities)
3. [Admin Instructions](#admin-instructions)
4. [Market Creation](#market-creation)
5. [Position Management](#position-management)
6. [Supply Operations](#supply-operations)
7. [Collateral Operations](#collateral-operations)
8. [Borrow Operations](#borrow-operations)
9. [Liquidation](#liquidation)
10. [Flash Loans](#flash-loans)
11. [Fee Management](#fee-management)
12. [Utilities](#utilities)

---

## Design Principles

### CEI Pattern (Checks-Effects-Interactions)

All instructions follow CEI pattern for re-entrancy protection:

```rust
pub fn example_instruction(ctx: Context<Example>, amount: u128) -> Result<()> {
    // ===== CHECKS =====
    // 1. Pause checks
    require!(!ctx.accounts.protocol_state.paused, MorphoError::ProtocolPaused);
    require!(!ctx.accounts.market.paused, MorphoError::MarketPaused);
    
    // 2. Input validation
    require!(amount > 0, MorphoError::ZeroAmount);
    
    // 3. Authorization checks
    validate_authorization(&ctx.accounts.caller, &ctx.accounts.position.owner, None)?;
    
    // 4. Interest accrual
    accrue_interest_internal(&mut ctx.accounts.market)?;
    
    // ===== EFFECTS =====
    // Update all state BEFORE any external calls
    ctx.accounts.market.total_supply_assets += amount;
    ctx.accounts.position.supply_shares += shares;
    
    // ===== INTERACTIONS =====
    // All CPIs happen LAST
    transfer_tokens_in(...)?;
    
    emit!(SomeEvent { ... });
    Ok(())
}
```

### Safe Amount Conversion

```rust
// CORRECT - checked conversion
let amount_u64 = safe_u128_to_u64(amount)?;
transfer_tokens(..., amount_u64)?;

// WRONG - silent truncation
transfer_tokens(..., amount as u64)?;  // DO NOT USE
```

---

## Token Transfer Utilities

Support both Token and Token-2022 programs.

```rust
use anchor_spl::token_interface::{
    TokenAccount, TokenInterface, Mint,
    transfer_checked, TransferChecked,
};

/// Transfer tokens IN to vault (user → protocol)
pub fn transfer_tokens_in<'info>(
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    authority: &Signer<'info>,
    mint: &InterfaceAccount<'info, Mint>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u128,
) -> Result<()> {
    let amount_u64 = safe_u128_to_u64(amount)?;
    
    if amount_u64 == 0 {
        return Ok(());
    }
    
    transfer_checked(
        CpiContext::new(
            token_program.to_account_info(),
            TransferChecked {
                from: from.to_account_info(),
                to: to.to_account_info(),
                authority: authority.to_account_info(),
                mint: mint.to_account_info(),
            },
        ),
        amount_u64,
        mint.decimals,
    )
}

/// Transfer tokens OUT from vault (protocol → user)
pub fn transfer_tokens_out<'info>(
    from: &InterfaceAccount<'info, TokenAccount>,
    to: &InterfaceAccount<'info, TokenAccount>,
    authority: &Account<'info, Market>,
    mint: &InterfaceAccount<'info, Mint>,
    token_program: &Interface<'info, TokenInterface>,
    amount: u128,
    market_id: &[u8; 32],
    bump: u8,
) -> Result<()> {
    let amount_u64 = safe_u128_to_u64(amount)?;
    
    if amount_u64 == 0 {
        return Ok(());
    }
    
    let seeds = &[
        PROGRAM_SEED_PREFIX,
        Market::SEED,
        market_id.as_ref(),
        &[bump],
    ];
    
    transfer_checked(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            TransferChecked {
                from: from.to_account_info(),
                to: to.to_account_info(),
                authority: authority.to_account_info(),
                mint: mint.to_account_info(),
            },
            &[seeds],
        ),
        amount_u64,
        mint.decimals,
    )
}
```

---

## Admin Instructions

### Initialize

```rust
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
```

### Two-Step Ownership Transfer

```rust
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
    
    emit!(OwnershipTransferred { previous_owner, new_owner: state.owner });
    Ok(())
}
```

### Pause Controls

```rust
pub fn set_protocol_paused(ctx: Context<SetPaused>, paused: bool) -> Result<()> {
    ctx.accounts.protocol_state.paused = paused;
    emit!(ProtocolPausedSet { paused });
    Ok(())
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
```

### Enable LLTV / IRM

```rust
pub fn enable_lltv(ctx: Context<EnableLltv>, lltv: u64) -> Result<()> {
    require!(lltv > 0 && lltv <= BPS, MorphoError::InvalidLltv);
    ctx.accounts.protocol_state.add_lltv(lltv)?;
    emit!(LltvEnabled { lltv });
    Ok(())
}

pub fn enable_irm(ctx: Context<EnableIrm>, irm: Pubkey) -> Result<()> {
    ctx.accounts.protocol_state.add_irm(irm)?;
    emit!(IrmEnabled { irm });
    Ok(())
}
```

---

## Market Creation

```rust
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
    pub protocol_state: Account<'info, ProtocolState>,
    
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
    pub market: Account<'info, Market>,
    
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
    
    /// CHECK: Oracle - validated by creator
    #[account(constraint = oracle.key() == oracle_key)]
    pub oracle: UncheckedAccount<'info>,
    
    /// CHECK: IRM - must be whitelisted
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
    
    require!(state.is_lltv_enabled(lltv), MorphoError::LltvNotEnabled);
    require!(state.is_irm_enabled(&irm_key), MorphoError::IrmNotEnabled);
    
    let market_id = calculate_market_id(
        &collateral_mint_key, &loan_mint_key, &oracle_key, &irm_key, lltv
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
```

---

## Position Management

### Create Position

```rust
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
    
    emit!(PositionCreated { market_id, owner: position.owner });
    Ok(())
}
```

### Close Position

```rust
#[derive(Accounts)]
#[instruction(market_id: [u8; 32])]
pub struct ClosePosition<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    
    #[account(mut)]
    pub rent_receiver: SystemAccount<'info>,
    
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
    emit!(PositionClosed { market_id, owner: ctx.accounts.owner.key() });
    Ok(())
}
```

---

## Supply Operations

### Supply

```rust
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
    let borrow_rate = get_borrow_rate_internal(&ctx.accounts.market)?;
    let current_time = Clock::get()?.unix_timestamp;
    accrue_interest(&mut ctx.accounts.market, current_time, borrow_rate)?;
    
    let market = &ctx.accounts.market;
    
    // Calculate shares (round DOWN)
    let shares = to_shares_down(assets, market.total_supply_assets, market.total_supply_shares)?;
    require!(shares >= min_shares, MorphoError::SlippageExceeded);
    
    // ===== EFFECTS =====
    let market = &mut ctx.accounts.market;
    market.total_supply_assets = checked_add(market.total_supply_assets, assets)?;
    market.total_supply_shares = checked_add(market.total_supply_shares, shares)?;
    
    ctx.accounts.position.supply_shares = checked_add(ctx.accounts.position.supply_shares, shares)?;
    
    // ===== INTERACTIONS =====
    transfer_tokens_in(
        &ctx.accounts.supplier_token_account,
        &ctx.accounts.loan_vault,
        &ctx.accounts.supplier,
        &ctx.accounts.loan_mint,
        &ctx.accounts.token_program,
        assets,
    )?;
    
    emit!(Supply {
        market_id,
        supplier: ctx.accounts.supplier.key(),
        on_behalf_of: ctx.accounts.on_behalf_of.key(),
        assets,
        shares,
    });
    
    Ok(())
}
```

### Withdraw

```rust
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
    
    validate_authorization(
        &ctx.accounts.caller,
        &ctx.accounts.position.owner,
        ctx.accounts.authorization.as_ref(),
    )?;
    
    // Accrue interest
    let borrow_rate = get_borrow_rate_internal(&ctx.accounts.market)?;
    let current_time = Clock::get()?.unix_timestamp;
    accrue_interest(&mut ctx.accounts.market, current_time, borrow_rate)?;
    
    let market = &ctx.accounts.market;
    
    // Calculate amounts
    let (withdraw_assets, burn_shares) = if assets > 0 {
        (assets, to_shares_up(assets, market.total_supply_assets, market.total_supply_shares)?)
    } else {
        (to_assets_down(shares, market.total_supply_assets, market.total_supply_shares)?, shares)
    };
    
    require!(ctx.accounts.position.supply_shares >= burn_shares, MorphoError::InsufficientBalance);
    require!(withdraw_assets <= market.available_liquidity(), MorphoError::InsufficientLiquidity);
    
    // ===== EFFECTS =====
    ctx.accounts.position.supply_shares = checked_sub(ctx.accounts.position.supply_shares, burn_shares)?;
    
    let market = &mut ctx.accounts.market;
    market.total_supply_assets = checked_sub(market.total_supply_assets, withdraw_assets)?;
    market.total_supply_shares = checked_sub(market.total_supply_shares, burn_shares)?;
    
    // ===== INTERACTIONS =====
    transfer_tokens_out(
        &ctx.accounts.loan_vault,
        &ctx.accounts.receiver_token_account,
        &ctx.accounts.market,
        &ctx.accounts.loan_mint,
        &ctx.accounts.token_program,
        withdraw_assets,
        &market_id,
        ctx.accounts.market.bump,
    )?;
    
    emit!(Withdraw {
        market_id,
        caller: ctx.accounts.caller.key(),
        on_behalf_of: ctx.accounts.position.owner,
        receiver: ctx.accounts.receiver_token_account.key(),
        assets: withdraw_assets,
        shares: burn_shares,
    });
    
    Ok(())
}
```

---

## Collateral Operations

### Supply Collateral

```rust
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
    transfer_tokens_in(
        &ctx.accounts.depositor_token_account,
        &ctx.accounts.collateral_vault,
        &ctx.accounts.depositor,
        &ctx.accounts.collateral_mint,
        &ctx.accounts.token_program,
        amount,
    )?;
    
    emit!(SupplyCollateral {
        market_id,
        depositor: ctx.accounts.depositor.key(),
        on_behalf_of: ctx.accounts.position.owner,
        amount,
    });
    
    Ok(())
}
```

### Withdraw Collateral

```rust
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
    let borrow_rate = get_borrow_rate_internal(&ctx.accounts.market)?;
    let current_time = Clock::get()?.unix_timestamp;
    accrue_interest(&mut ctx.accounts.market, current_time, borrow_rate)?;
    
    require!(ctx.accounts.position.collateral >= amount, MorphoError::InsufficientCollateral);
    
    // ===== EFFECTS =====
    ctx.accounts.position.collateral = checked_sub(ctx.accounts.position.collateral, amount)?;
    
    // Health check AFTER effect, BEFORE interaction
    if ctx.accounts.position.borrow_shares > 0 {
        let oracle_price = get_oracle_price_validated(&ctx.accounts.oracle, &ctx.accounts.market)?;
        require!(
            !is_liquidatable(
                ctx.accounts.position.collateral,
                ctx.accounts.position.borrow_shares,
                ctx.accounts.market.total_borrow_assets,
                ctx.accounts.market.total_borrow_shares,
                oracle_price,
                ctx.accounts.market.lltv,
            )?,
            MorphoError::PositionUnhealthy
        );
    }
    
    // ===== INTERACTIONS =====
    transfer_tokens_out(
        &ctx.accounts.collateral_vault,
        &ctx.accounts.receiver_token_account,
        &ctx.accounts.market,
        &ctx.accounts.collateral_mint,
        &ctx.accounts.token_program,
        amount,
        &market_id,
        ctx.accounts.market.bump,
    )?;
    
    emit!(WithdrawCollateral {
        market_id,
        caller: ctx.accounts.caller.key(),
        on_behalf_of: ctx.accounts.position.owner,
        receiver: ctx.accounts.receiver_token_account.key(),
        amount,
    });
    
    Ok(())
}
```

---

## Borrow Operations

### Borrow

```rust
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
    let borrow_rate = get_borrow_rate_internal(&ctx.accounts.market)?;
    let current_time = Clock::get()?.unix_timestamp;
    accrue_interest(&mut ctx.accounts.market, current_time, borrow_rate)?;
    
    let market = &ctx.accounts.market;
    require!(assets <= market.available_liquidity(), MorphoError::InsufficientLiquidity);
    
    // Calculate shares (round UP)
    let shares = to_shares_up(assets, market.total_borrow_assets, market.total_borrow_shares)?;
    if max_shares > 0 {
        require!(shares <= max_shares, MorphoError::SlippageExceeded);
    }
    
    // ===== EFFECTS =====
    ctx.accounts.position.borrow_shares = checked_add(ctx.accounts.position.borrow_shares, shares)?;
    
    let market = &mut ctx.accounts.market;
    market.total_borrow_assets = checked_add(market.total_borrow_assets, assets)?;
    market.total_borrow_shares = checked_add(market.total_borrow_shares, shares)?;
    
    // Health check AFTER effect
    let oracle_price = get_oracle_price_validated(&ctx.accounts.oracle, &ctx.accounts.market)?;
    require!(
        !is_liquidatable(
            ctx.accounts.position.collateral,
            ctx.accounts.position.borrow_shares,
            ctx.accounts.market.total_borrow_assets,
            ctx.accounts.market.total_borrow_shares,
            oracle_price,
            ctx.accounts.market.lltv,
        )?,
        MorphoError::PositionUnhealthy
    );
    
    // ===== INTERACTIONS =====
    transfer_tokens_out(
        &ctx.accounts.loan_vault,
        &ctx.accounts.receiver_token_account,
        &ctx.accounts.market,
        &ctx.accounts.loan_mint,
        &ctx.accounts.token_program,
        assets,
        &market_id,
        ctx.accounts.market.bump,
    )?;
    
    emit!(Borrow {
        market_id,
        caller: ctx.accounts.caller.key(),
        on_behalf_of: ctx.accounts.position.owner,
        receiver: ctx.accounts.receiver_token_account.key(),
        assets,
        shares,
    });
    
    Ok(())
}
```

### Repay

```rust
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
    let borrow_rate = get_borrow_rate_internal(&ctx.accounts.market)?;
    let current_time = Clock::get()?.unix_timestamp;
    accrue_interest(&mut ctx.accounts.market, current_time, borrow_rate)?;
    
    let market = &ctx.accounts.market;
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
    
    let market = &mut ctx.accounts.market;
    market.total_borrow_assets = checked_sub(market.total_borrow_assets, repay_assets)?;
    market.total_borrow_shares = checked_sub(market.total_borrow_shares, burn_shares)?;
    
    // ===== INTERACTIONS =====
    transfer_tokens_in(
        &ctx.accounts.repayer_token_account,
        &ctx.accounts.loan_vault,
        &ctx.accounts.repayer,
        &ctx.accounts.loan_mint,
        &ctx.accounts.token_program,
        repay_assets,
    )?;
    
    emit!(Repay {
        market_id,
        repayer: ctx.accounts.repayer.key(),
        on_behalf_of: ctx.accounts.position.owner,
        assets: repay_assets,
        shares: burn_shares,
    });
    
    Ok(())
}
```

---

## Liquidation

```rust
pub fn liquidate(
    ctx: Context<Liquidate>,
    market_id: [u8; 32],
    seized_assets: u128,
) -> Result<()> {
    // ===== CHECKS =====
    // Note: Liquidation allowed even when paused (maintains health)
    require!(seized_assets > 0, MorphoError::ZeroAmount);
    
    // Accrue interest
    let borrow_rate = get_borrow_rate_internal(&ctx.accounts.market)?;
    let current_time = Clock::get()?.unix_timestamp;
    accrue_interest(&mut ctx.accounts.market, current_time, borrow_rate)?;
    
    let market = &ctx.accounts.market;
    let position = &ctx.accounts.borrower_position;
    
    // Get validated oracle price
    let oracle_price = get_oracle_price_validated(&ctx.accounts.oracle, market)?;
    
    // Verify liquidatable
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
    
    let lif = calculate_lif(market.lltv);
    let seized_collateral = calculate_seized_collateral(seized_assets, oracle_price, lif)?;
    let seized_collateral = std::cmp::min(seized_collateral, position.collateral);
    
    let repaid_shares = to_shares_down(seized_assets, market.total_borrow_assets, market.total_borrow_shares)?;
    let repaid_shares = std::cmp::min(repaid_shares, position.borrow_shares);
    let actual_seized_assets = to_assets_up(repaid_shares, market.total_borrow_assets, market.total_borrow_shares)?;
    
    // ===== EFFECTS =====
    let position = &mut ctx.accounts.borrower_position;
    position.borrow_shares = checked_sub(position.borrow_shares, repaid_shares)?;
    position.collateral = checked_sub(position.collateral, seized_collateral)?;
    
    let market = &mut ctx.accounts.market;
    market.total_borrow_shares = checked_sub(market.total_borrow_shares, repaid_shares)?;
    market.total_borrow_assets = checked_sub(market.total_borrow_assets, actual_seized_assets)?;
    
    // Bad debt handling
    if position.collateral == 0 && position.borrow_shares > 0 {
        let bad_debt = socialize_bad_debt(market, position.borrow_shares)?;
        position.borrow_shares = 0;
        emit!(BadDebtRealized { market_id, borrower: ctx.accounts.borrower.key(), bad_debt_assets: bad_debt, bad_debt_shares: 0 });
    }
    
    // ===== INTERACTIONS =====
    transfer_tokens_in(
        &ctx.accounts.liquidator_loan_account,
        &ctx.accounts.loan_vault,
        &ctx.accounts.liquidator,
        &ctx.accounts.loan_mint,
        &ctx.accounts.token_program,
        actual_seized_assets,
    )?;
    
    transfer_tokens_out(
        &ctx.accounts.collateral_vault,
        &ctx.accounts.liquidator_collateral_account,
        &ctx.accounts.market,
        &ctx.accounts.collateral_mint,
        &ctx.accounts.token_program,
        seized_collateral,
        &market_id,
        ctx.accounts.market.bump,
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
```

---

## Flash Loans

```rust
pub const FLASH_LOAN_FEE_BPS: u64 = 5; // 0.05%

pub fn flash_loan(
    ctx: Context<FlashLoan>,
    market_id: [u8; 32],
    amount: u128,
) -> Result<()> {
    require!(!ctx.accounts.protocol_state.paused, MorphoError::ProtocolPaused);
    require!(!ctx.accounts.market.paused, MorphoError::MarketPaused);
    require!(amount > 0, MorphoError::ZeroAmount);
    require!(amount <= ctx.accounts.market.available_liquidity(), MorphoError::InsufficientLiquidity);
    
    let fee = mul_div_up(amount, FLASH_LOAN_FEE_BPS as u128, BPS as u128)?;
    let vault_before = ctx.accounts.loan_vault.amount;
    
    // Transfer out
    transfer_tokens_out(
        &ctx.accounts.loan_vault,
        &ctx.accounts.borrower_token_account,
        &ctx.accounts.market,
        &ctx.accounts.loan_mint,
        &ctx.accounts.token_program,
        amount,
        &market_id,
        ctx.accounts.market.bump,
    )?;
    
    // Verify repayment
    ctx.accounts.loan_vault.reload()?;
    let required = checked_add(vault_before as u128, fee)?;
    require!(ctx.accounts.loan_vault.amount as u128 >= required, MorphoError::FlashLoanNotRepaid);
    
    // Fee to suppliers
    ctx.accounts.market.total_supply_assets = checked_add(ctx.accounts.market.total_supply_assets, fee)?;
    
    emit!(FlashLoan { market_id, borrower: ctx.accounts.borrower.key(), amount, fee });
    Ok(())
}
```

---

## Fee Management

### Claim Fees

```rust
pub fn claim_fees(ctx: Context<ClaimFees>, market_id: [u8; 32]) -> Result<()> {
    let pending = ctx.accounts.market.pending_fee_shares;
    if pending == 0 { return Ok(()); }
    
    ctx.accounts.fee_position.supply_shares = checked_add(ctx.accounts.fee_position.supply_shares, pending)?;
    ctx.accounts.market.pending_fee_shares = 0;
    
    emit!(FeesClaimed { market_id, recipient: ctx.accounts.protocol_state.fee_recipient, shares: pending });
    Ok(())
}
```

---

## Utilities

### Authorization Validation

```rust
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
        if auth.authorizer == *owner && 
           auth.authorized == caller.key() && 
           auth.is_valid(current_time) {
            return Ok(());
        }
    }
    
    Err(MorphoError::Unauthorized.into())
}
```

### Accrue Interest (Public)

```rust
pub fn accrue_interest_ix(ctx: Context<AccrueInterest>, market_id: [u8; 32]) -> Result<()> {
    let borrow_rate = get_borrow_rate_internal(&ctx.accounts.market)?;
    let current_time = Clock::get()?.unix_timestamp;
    
    let (interest, fee_shares) = accrue_interest(&mut ctx.accounts.market, current_time, borrow_rate)?;
    
    emit!(InterestAccrued {
        market_id,
        interest,
        fee_shares,
        total_supply_assets: ctx.accounts.market.total_supply_assets,
        total_borrow_assets: ctx.accounts.market.total_borrow_assets,
    });
    
    Ok(())
}
```
