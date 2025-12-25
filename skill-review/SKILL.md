# Morpho Blue → Solana Implementation Guide (v2)

Build a minimal, isolated-market lending protocol on Solana—a production-ready port of Morpho Blue's ~650 LOC design philosophy.

## What's New in v2

- ✅ Token-2022 / Token Extensions support
- ✅ Safe u128 → u64 conversions (no truncation)
- ✅ Re-entrancy protection via CEI pattern
- ✅ Robust oracle CPI validation
- ✅ Fixed precision loss in interest calculations
- ✅ Proper decimals handling across tokens
- ✅ Flash loan support
- ✅ Fee recipient position management
- ✅ Emergency pause mechanism
- ✅ Position close / rent reclaim
- ✅ Two-step ownership transfer
- ✅ LiteSVM + Surfpool testing setup

## MCP Integration

This skill uses **Solana MCP** for Anchor framework assistance. When stuck:

```
Solana MCP Tools:
├── Ask_Solana_Anchor_Framework_Expert  → Anchor-specific questions
├── Solana_Documentation_Search         → Search Solana docs
└── Solana_Expert__Ask_For_Help         → General Solana questions
```

## Architecture Overview

**Core Concept**: Each market = 1 collateral token + 1 loan token + 1 oracle + 1 IRM + 1 LLTV. Complete risk isolation.

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Protocol State │     │  Market State   │     │    Position     │
│  PDA: [protocol]│     │  PDA: [market,  │     │  PDA: [position,│
│                 │     │        id]      │     │        market,  │
│  • owner        │     │  • tokens/oracle│     │        user]    │
│  • fee_recipient│     │  • totals       │     │  • shares       │
│  • paused       │     │  • last_update  │     │  • collateral   │
│  • enabled_*    │     │  • paused       │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Project Setup

```bash
anchor init morpho-solana
cd morpho-solana

# Add dependencies to Cargo.toml
# anchor-lang = "0.30.1"
# anchor-spl = { version = "0.30.1", features = ["token-2022"] }
# spl-token-2022 = "3.0"
```

Directory structure:
```
programs/morpho-solana/src/
├── lib.rs                  # Entry point, instruction dispatch
├── state/
│   ├── mod.rs
│   ├── protocol.rs         # ProtocolState account
│   ├── market.rs           # Market account
│   ├── position.rs         # Position account
│   └── authorization.rs    # Authorization account
├── instructions/
│   ├── mod.rs
│   ├── admin.rs            # initialize, set_fee, pause, ownership
│   ├── market.rs           # create_market
│   ├── supply.rs           # supply, withdraw
│   ├── borrow.rs           # borrow, repay, collateral ops
│   ├── liquidate.rs        # liquidate
│   ├── flash_loan.rs       # flash_loan
│   └── position.rs         # create_position, close_position
├── math/
│   ├── mod.rs
│   ├── safe_math.rs        # Safe u128→u64, checked ops
│   ├── shares.rs           # ERC-4626 style conversions
│   ├── interest.rs         # Accrual logic (fixed precision)
│   └── wad.rs              # Fixed-point arithmetic
├── interfaces/
│   ├── mod.rs
│   ├── oracle.rs           # Oracle interface + validation
│   └── irm.rs              # IRM interface
├── errors.rs
└── events.rs
```

## Implementation Steps

### Step 1: Account Structures
Read [references/accounts.md](references/accounts.md) for complete definitions with:
- Fixed-size arrays instead of Vecs for enabled LLTVs/IRMs
- Pause states at protocol and market level
- Pending owner for two-step transfer

### Step 2: Safe Math Libraries
Read [references/math.md](references/math.md) for:
- Safe u128 → u64 conversion with overflow checks
- Fixed precision interest calculations
- Proper rounding with decimals awareness

### Step 3: Core Instructions
Read [references/instructions.md](references/instructions.md) with:
- CEI (Checks-Effects-Interactions) pattern throughout
- Token-2022 compatible transfers
- Pause checks on all user operations

### Step 4: Oracles & IRMs
Read [references/oracles-irms.md](references/oracles-irms.md) for:
- Validated CPI return data parsing
- Decimals normalization
- Staleness protection

### Step 5: Testing with LiteSVM + Surfpool
Read [references/testing.md](references/testing.md) for:
- LiteSVM setup and configuration
- Surfpool integration for mainnet forking
- Comprehensive test scenarios

## Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Share model | Virtual offset 1e6/1 | Prevents inflation attack |
| Collateral | Raw amounts, not shares | Simpler, no interest on collateral |
| Liquidation | No close factor (100%) | Matches Morpho Blue |
| Bad debt | Socialized to suppliers | Fair distribution |
| Governance | Fixed-size whitelist | Predictable account size |
| Token support | Token + Token-2022 | Maximum compatibility |
| State updates | CEI pattern | Re-entrancy protection |

## Critical Safety Checks

1. **Always convert u128 → u64 safely**:
   ```rust
   let amount = safe_u128_to_u64(assets)?;
   ```

2. **Always accrue interest** before reading totals

3. **Always check pause state** on user operations

4. **Always validate oracle program ID** before trusting return data

5. **Always use CEI pattern**:
   ```rust
   // Checks
   require!(!market.paused, MorphoError::MarketPaused);
   // Effects (state updates)
   market.total_supply_assets += assets;
   position.supply_shares += shares;
   // Interactions (CPIs)
   transfer_tokens(...)?;
   ```

## Quick Reference

```rust
// Safe conversion
let amount_u64 = safe_u128_to_u64(amount_u128)?;

// Market ID derivation
let market_id = keccak256(collateral, loan, oracle, irm, lltv);

// Health check
let max_borrow = collateral * price * lltv / ORACLE_SCALE / BPS;
let is_healthy = borrowed <= max_borrow;

// LIF calculation
let lif = min(MAX_LIF, BPS * BPS / (BPS - CURSOR * (BPS - lltv) / BPS));
```

## Common Pitfalls (Updated)

1. **Using `as u64` instead of safe conversion** - causes silent truncation
2. **Forgetting to accrue interest** - stale totals break everything
3. **Wrong rounding direction** - always favor protocol
4. **Missing pause checks** - allows ops during emergency
5. **Oracle price scaling** - must handle decimals correctly
6. **CPI ordering** - always do state updates before CPIs (CEI)
7. **Token-2022 transfers** - use TokenInterface, not Token
8. **Fee shares not credited** - breaks accounting

> **Stuck?** Use `Ask_Solana_Anchor_Framework_Expert` with your specific error.
