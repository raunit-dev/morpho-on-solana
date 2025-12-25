# Oracles & Interest Rate Models (v2)

## Table of Contents
1. [Oracle Interface](#oracle-interface)
2. [Validated Oracle CPI](#validated-oracle-cpi)
3. [Oracle Adapters](#oracle-adapters)
4. [IRM Interface](#irm-interface)
5. [IRM Implementations](#irm-implementations)
6. [CPI Patterns](#cpi-patterns)

---

## Oracle Interface

Oracles return: **collateral tokens per 1 loan token** (scaled 1e36 = ORACLE_SCALE)

Example: If ETH = $2000 and USDC = $1:
- For ETH/USDC market: oracle returns 2000 * 1e36 (2000 USDC per 1 ETH)
- For USDC/ETH market: oracle returns 0.0005 * 1e36 (0.0005 ETH per 1 USDC)

```rust
/// Oracle programs must implement this instruction
/// 
/// Returns: u128 price scaled by ORACLE_SCALE (1e36)
pub trait IOracle {
    fn price(accounts: &[AccountInfo]) -> Result<u128>;
}

/// Oracle configuration account (standard layout)
#[account]
pub struct OracleConfig {
    pub bump: u8,
    
    /// Collateral token price feed
    pub collateral_feed: Pubkey,
    
    /// Loan token price feed  
    pub loan_feed: Pubkey,
    
    /// Token decimals for normalization
    pub collateral_decimals: u8,
    pub loan_decimals: u8,
    
    /// Staleness threshold (seconds)
    pub max_staleness: i64,
    
    /// Oracle program ID for validation
    pub oracle_program: Pubkey,
}
```

---

## Validated Oracle CPI

**CRITICAL**: Always validate the oracle program ID before trusting return data.

```rust
use anchor_lang::solana_program::program::get_return_data;

/// ORACLE_SCALE = 1e36
pub const ORACLE_SCALE: u128 = 1_000_000_000_000_000_000_000_000_000_000_000_000;

/// Get price from oracle with FULL VALIDATION
/// 
/// Security checks:
/// 1. Oracle account matches market's configured oracle
/// 2. Return data came from expected oracle program
/// 3. Price is non-zero and reasonable
pub fn get_oracle_price_validated<'info>(
    oracle: &AccountInfo<'info>,
    market: &Market,
) -> Result<u128> {
    // Check 1: Oracle account matches market configuration
    require!(
        oracle.key() == market.oracle,
        MorphoError::InvalidOracle
    );
    
    // Invoke oracle's price instruction
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: *oracle.owner,  // Oracle is owned by its program
        accounts: vec![
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                oracle.key(),
                false,
            ),
        ],
        data: vec![0], // "price" instruction discriminator (customize per oracle)
    };
    
    anchor_lang::solana_program::program::invoke(
        &ix,
        &[oracle.clone()],
    )?;
    
    // Get return data
    let (returned_program_id, return_data) = get_return_data()
        .ok_or(MorphoError::OracleNoReturnData)?;
    
    // Check 2: Validate return data came from expected program
    require!(
        returned_program_id == *oracle.owner,
        MorphoError::OracleInvalidProgram
    );
    
    // Check 3: Parse and validate price
    require!(
        return_data.len() >= 16,
        MorphoError::OracleInvalidReturnData
    );
    
    let price = u128::from_le_bytes(
        return_data[..16]
            .try_into()
            .map_err(|_| MorphoError::OracleInvalidReturnData)?
    );
    
    // Check 4: Price sanity checks
    require!(price > 0, MorphoError::OracleInvalidPrice);
    require!(
        price <= ORACLE_SCALE * 1_000_000_000, // Max 1 billion ratio
        MorphoError::OraclePriceTooHigh
    );
    
    Ok(price)
}

/// Alternative: Direct price read from account data
/// Use when oracle stores price in account (not via CPI return data)
pub fn get_oracle_price_from_account<'info>(
    oracle_config: &Account<'info, OracleConfig>,
    collateral_feed: &AccountInfo<'info>,
    loan_feed: &AccountInfo<'info>,
    market: &Market,
) -> Result<u128> {
    // Validate oracle config matches market
    require!(
        oracle_config.key() == market.oracle,
        MorphoError::InvalidOracle
    );
    
    // Read prices from feed accounts (implementation depends on oracle type)
    let collateral_price = read_price_feed(collateral_feed, oracle_config.max_staleness)?;
    let loan_price = read_price_feed(loan_feed, oracle_config.max_staleness)?;
    
    // Calculate price with decimals normalization
    normalize_oracle_price(
        loan_price.price,
        loan_price.expo,
        collateral_price.price,
        collateral_price.expo,
        market.loan_decimals,
        market.collateral_decimals,
    )
}
```

---

## Oracle Adapters

### Pyth Adapter

```rust
use pyth_solana_receiver_sdk::price_update::{PriceUpdateV2, get_feed_id_from_hex};

#[derive(Accounts)]
pub struct GetPythPrice<'info> {
    pub oracle_config: Account<'info, OracleConfig>,
    pub collateral_price_update: Account<'info, PriceUpdateV2>,
    pub loan_price_update: Account<'info, PriceUpdateV2>,
}

pub fn get_pyth_price(ctx: Context<GetPythPrice>) -> Result<u128> {
    let config = &ctx.accounts.oracle_config;
    let clock = Clock::get()?;
    
    // Get collateral price with staleness check
    let collateral_price = ctx.accounts.collateral_price_update
        .get_price_no_older_than(
            &clock,
            config.max_staleness as u64,
            &config.collateral_feed,
        )
        .map_err(|_| MorphoError::OracleStale)?;
    
    // Get loan price with staleness check
    let loan_price = ctx.accounts.loan_price_update
        .get_price_no_older_than(
            &clock,
            config.max_staleness as u64,
            &config.loan_feed,
        )
        .map_err(|_| MorphoError::OracleStale)?;
    
    // Validate prices are positive
    require!(collateral_price.price > 0, MorphoError::OracleInvalidPrice);
    require!(loan_price.price > 0, MorphoError::OracleInvalidPrice);
    
    // Calculate normalized price
    normalize_oracle_price(
        loan_price.price as u128,
        loan_price.exponent,
        collateral_price.price as u128,
        collateral_price.exponent,
        config.loan_decimals,
        config.collateral_decimals,
    )
}

/// Normalize price from oracle feeds to ORACLE_SCALE
/// 
/// Formula:
/// price = (loan_price / collateral_price) * 10^(collateral_decimals - loan_decimals) * ORACLE_SCALE
pub fn normalize_oracle_price(
    loan_price: u128,
    loan_expo: i32,
    collateral_price: u128,
    collateral_expo: i32,
    loan_decimals: u8,
    collateral_decimals: u8,
) -> Result<u128> {
    require!(collateral_price > 0, MorphoError::OracleInvalidPrice);
    
    // Normalize both prices to 18 decimals first
    let loan_normalized = normalize_price_to_18_decimals(loan_price, loan_expo)?;
    let collateral_normalized = normalize_price_to_18_decimals(collateral_price, collateral_expo)?;
    
    // base_price = loan / collateral (WAD scaled)
    let base_price = mul_div_down(loan_normalized, WAD, collateral_normalized)?;
    
    // Adjust for token decimals difference
    let decimal_diff = collateral_decimals as i32 - loan_decimals as i32;
    let adjusted_price = if decimal_diff >= 0 {
        checked_mul(base_price, 10u128.pow(decimal_diff as u32))?
    } else {
        base_price / 10u128.pow((-decimal_diff) as u32)
    };
    
    // Scale from WAD (1e18) to ORACLE_SCALE (1e36)
    mul_div_down(adjusted_price, ORACLE_SCALE, WAD)
}

fn normalize_price_to_18_decimals(price: u128, expo: i32) -> Result<u128> {
    let target_expo = 18i32;
    let diff = target_expo - (-expo); // Pyth expo is negative
    
    if diff >= 0 {
        checked_mul(price, 10u128.pow(diff as u32))
    } else {
        Ok(price / 10u128.pow((-diff) as u32))
    }
}
```

### Switchboard Adapter

```rust
use switchboard_on_demand::PullFeedAccountData;

#[derive(Accounts)]
pub struct GetSwitchboardPrice<'info> {
    pub oracle_config: Account<'info, OracleConfig>,
    pub collateral_feed: AccountLoader<'info, PullFeedAccountData>,
    pub loan_feed: AccountLoader<'info, PullFeedAccountData>,
}

pub fn get_switchboard_price(ctx: Context<GetSwitchboardPrice>) -> Result<u128> {
    let config = &ctx.accounts.oracle_config;
    let clock = Clock::get()?;
    
    let collateral_feed = ctx.accounts.collateral_feed.load()?;
    let collateral_result = collateral_feed.get_value(
        &clock,
        config.max_staleness as u64,
        1,    // min_samples
        true, // only_positive
    ).map_err(|_| MorphoError::OracleStale)?;
    
    let loan_feed = ctx.accounts.loan_feed.load()?;
    let loan_result = loan_feed.get_value(
        &clock,
        config.max_staleness as u64,
        1,
        true,
    ).map_err(|_| MorphoError::OracleStale)?;
    
    // Switchboard returns Decimal with 18 decimals
    let collateral_price = switchboard_decimal_to_u128(collateral_result)?;
    let loan_price = switchboard_decimal_to_u128(loan_result)?;
    
    require!(collateral_price > 0, MorphoError::OracleInvalidPrice);
    require!(loan_price > 0, MorphoError::OracleInvalidPrice);
    
    // Both prices are 18 decimal, so just do the division
    let base_price = mul_div_down(loan_price, WAD, collateral_price)?;
    
    // Adjust for token decimals
    let decimal_diff = config.collateral_decimals as i32 - config.loan_decimals as i32;
    let adjusted_price = if decimal_diff >= 0 {
        checked_mul(base_price, 10u128.pow(decimal_diff as u32))?
    } else {
        base_price / 10u128.pow((-decimal_diff) as u32)
    };
    
    // Scale to ORACLE_SCALE
    mul_div_down(adjusted_price, ORACLE_SCALE, WAD)
}

fn switchboard_decimal_to_u128(decimal: switchboard_on_demand::Decimal) -> Result<u128> {
    // Switchboard Decimal is i128 mantissa with 18 decimals
    let mantissa = decimal.mantissa();
    require!(mantissa > 0, MorphoError::OracleInvalidPrice);
    Ok(mantissa as u128)
}
```

### Static Oracle (Testing)

```rust
#[account]
pub struct StaticOracle {
    pub bump: u8,
    pub price: u128,  // Fixed price scaled by ORACLE_SCALE
    pub admin: Pubkey,
}

impl StaticOracle {
    pub const SEED: &'static [u8] = b"static_oracle";
    
    pub fn space() -> usize {
        8 + 1 + 16 + 32
    }
}

pub fn get_static_price(ctx: Context<GetStaticPrice>) -> Result<u128> {
    let price = ctx.accounts.static_oracle.price;
    require!(price > 0, MorphoError::OracleInvalidPrice);
    Ok(price)
}

pub fn set_static_price(ctx: Context<SetStaticPrice>, new_price: u128) -> Result<()> {
    require!(
        ctx.accounts.admin.key() == ctx.accounts.static_oracle.admin,
        MorphoError::Unauthorized
    );
    require!(new_price > 0, MorphoError::OracleInvalidPrice);
    
    ctx.accounts.static_oracle.price = new_price;
    Ok(())
}
```

---

## IRM Interface

IRMs return: **borrow rate per second** (scaled 1e18 = WAD)

Example: 5% APY ≈ 1.58e-9 per second = 1_580_000_000 when scaled by WAD

```rust
/// IRM programs must implement this instruction
pub trait IInterestRateModel {
    fn borrow_rate(
        accounts: &[AccountInfo],
        total_supply_assets: u128,
        total_borrow_assets: u128,
    ) -> Result<u128>;
}

pub const SECONDS_PER_YEAR: u128 = 31_536_000;
```

---

## IRM Implementations

### Linear (Kinked) IRM

Classic two-slope model.

```rust
#[account]
pub struct LinearIRM {
    pub bump: u8,
    
    /// Base rate at 0% utilization (yearly, WAD-scaled)
    pub base_rate: u128,
    
    /// Slope below kink (yearly, WAD-scaled)
    pub slope1: u128,
    
    /// Slope above kink (yearly, WAD-scaled)
    pub slope2: u128,
    
    /// Utilization kink point (WAD-scaled, e.g., 0.8e18 = 80%)
    pub kink: u128,
}

impl LinearIRM {
    pub const SEED: &'static [u8] = b"linear_irm";
    
    pub fn space() -> usize {
        8 + 1 + 16 * 4
    }
    
    /// Calculate borrow rate per second
    pub fn borrow_rate(&self, supply: u128, borrow: u128) -> Result<u128> {
        if supply == 0 {
            return Ok(self.base_rate / SECONDS_PER_YEAR);
        }
        
        // Utilization = borrow / supply (WAD-scaled)
        let utilization = mul_div_down(borrow, WAD, supply)?;
        
        let yearly_rate = if utilization <= self.kink {
            // Below kink: base + slope1 * utilization / WAD
            let variable = wad_mul_down(utilization, self.slope1)?;
            checked_add(self.base_rate, variable)?
        } else {
            // Above kink: rate_at_kink + slope2 * (utilization - kink) / WAD
            let rate_at_kink = checked_add(
                self.base_rate,
                wad_mul_down(self.kink, self.slope1)?,
            )?;
            let excess = checked_sub(utilization, self.kink)?;
            let excess_rate = wad_mul_down(excess, self.slope2)?;
            checked_add(rate_at_kink, excess_rate)?
        };
        
        // Convert to per-second rate
        Ok(yearly_rate / SECONDS_PER_YEAR)
    }
}

// Example configuration:
// base_rate: 0.01e18  (1% base)
// slope1:    0.04e18  (4% slope below kink)
// slope2:    0.75e18  (75% slope above kink)
// kink:      0.80e18  (80% target utilization)
//
// At 0% util:   1% APY
// At 50% util:  1% + 4% * 0.5 = 3% APY
// At 80% util:  1% + 4% * 0.8 = 4.2% APY (kink)
// At 90% util:  4.2% + 75% * 0.1 = 11.7% APY
// At 100% util: 4.2% + 75% * 0.2 = 19.2% APY
```

### Adaptive Curve IRM

Morpho Blue's adaptive model.

```rust
#[account]
pub struct AdaptiveCurveIRM {
    pub bump: u8,
    
    /// Curve steepness
    pub curve_steepness: u128,
    
    /// Target utilization (WAD-scaled)
    pub target_utilization: u128,
    
    /// Adjustment speed per year (WAD-scaled)
    pub adjustment_speed: u128,
    
    /// Current rate at target (adjusts over time)
    pub rate_at_target: u128,
    
    /// Rate bounds
    pub min_rate_at_target: u128,
    pub max_rate_at_target: u128,
    
    /// Last update timestamp
    pub last_update: i64,
}

impl AdaptiveCurveIRM {
    pub fn borrow_rate(&self, supply: u128, borrow: u128) -> Result<u128> {
        if supply == 0 {
            return Ok(self.min_rate_at_target / SECONDS_PER_YEAR);
        }
        
        let utilization = mul_div_down(borrow, WAD, supply)?;
        
        // Exponential curve around target
        let diff = if utilization > self.target_utilization {
            checked_sub(utilization, self.target_utilization)?
        } else {
            checked_sub(self.target_utilization, utilization)?
        };
        
        let exponent = wad_mul_down(self.curve_steepness, diff)?;
        let multiplier = exp_approx(exponent)?;
        
        let yearly_rate = if utilization > self.target_utilization {
            wad_mul_down(self.rate_at_target, multiplier)?
        } else {
            wad_div_down(self.rate_at_target, multiplier)?
        };
        
        Ok(yearly_rate / SECONDS_PER_YEAR)
    }
}

/// Taylor series approximation for e^x
fn exp_approx(x: u128) -> Result<u128> {
    // e^x ≈ 1 + x + x²/2 + x³/6 + x⁴/24
    let x2 = wad_mul_down(x, x)?;
    let x3 = wad_mul_down(x2, x)?;
    let x4 = wad_mul_down(x3, x)?;
    
    let result = WAD;
    let result = checked_add(result, x)?;
    let result = checked_add(result, x2 / 2)?;
    let result = checked_add(result, x3 / 6)?;
    let result = checked_add(result, x4 / 24)?;
    
    Ok(result)
}
```

### Zero IRM (Testing)

```rust
#[account]
pub struct ZeroIRM {
    pub bump: u8,
}

impl ZeroIRM {
    pub fn borrow_rate(&self, _supply: u128, _borrow: u128) -> u128 {
        0
    }
}
```

---

## CPI Patterns

### Getting Borrow Rate from IRM

```rust
/// Get borrow rate from IRM - for internal use during interest accrual
pub fn get_borrow_rate_internal(market: &Market) -> Result<u128> {
    // For embedded IRMs, calculate directly
    // For external IRMs, use CPI
    
    // Simple approach: use utilization-based rate
    if market.total_supply_assets == 0 {
        return Ok(0);
    }
    
    // Default 5% APY base + utilization-based
    let utilization = market.utilization();
    let base_rate = WAD / 20; // 5% yearly
    let variable_rate = wad_mul_down(utilization, WAD / 10)?; // up to 10% more
    
    let yearly_rate = checked_add(base_rate, variable_rate)?;
    Ok(yearly_rate / SECONDS_PER_YEAR)
}

/// External IRM CPI call (when IRM is separate program)
pub fn get_borrow_rate_cpi<'info>(
    irm_program: &AccountInfo<'info>,
    irm_config: &AccountInfo<'info>,
    total_supply_assets: u128,
    total_borrow_assets: u128,
) -> Result<u128> {
    // Build instruction data
    let mut data = vec![0u8]; // Instruction discriminator
    data.extend_from_slice(&total_supply_assets.to_le_bytes());
    data.extend_from_slice(&total_borrow_assets.to_le_bytes());
    
    let ix = anchor_lang::solana_program::instruction::Instruction {
        program_id: *irm_program.key,
        accounts: vec![
            anchor_lang::solana_program::instruction::AccountMeta::new_readonly(
                irm_config.key(),
                false,
            ),
        ],
        data,
    };
    
    anchor_lang::solana_program::program::invoke(
        &ix,
        &[irm_config.clone()],
    )?;
    
    // Parse return data
    let (returned_program_id, return_data) = get_return_data()
        .ok_or(MorphoError::IrmNoReturnData)?;
    
    require!(
        returned_program_id == *irm_program.key,
        MorphoError::IrmInvalidProgram
    );
    
    require!(return_data.len() >= 16, MorphoError::IrmInvalidReturnData);
    
    let rate = u128::from_le_bytes(
        return_data[..16].try_into().map_err(|_| MorphoError::IrmInvalidReturnData)?
    );
    
    // Sanity check: rate shouldn't exceed 1000% APY per second
    let max_rate = WAD * 10 / SECONDS_PER_YEAR;
    require!(rate <= max_rate, MorphoError::IrmRateTooHigh);
    
    Ok(rate)
}
```

---

## Creating New Oracles/IRMs

### Oracle Checklist

1. ✅ Implement `price()` returning u128 scaled by ORACLE_SCALE (1e36)
2. ✅ Handle staleness checks (reject stale prices)
3. ✅ Handle price = 0 gracefully (return error, not zero)
4. ✅ Handle token decimals correctly
5. ✅ Consider TWAP for manipulation resistance
6. ✅ Test with extreme prices (very small, very large)
7. ✅ Validate return data came from expected program
8. ✅ Set reasonable price bounds

### IRM Checklist

1. ✅ Implement `borrow_rate()` returning per-second rate scaled by WAD
2. ✅ Handle supply = 0 edge case (return 0 or base rate)
3. ✅ Ensure rate never overflows when compounded
4. ✅ Test at extreme utilizations (0%, 100%, >100%)
5. ✅ Consider rate caps for safety
6. ✅ Validate return data came from expected program
