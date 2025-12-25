# Testing Guide (v2) - LiteSVM + Surfpool

## Table of Contents
1. [Setup](#setup)
2. [LiteSVM Configuration](#litesvm-configuration)
3. [Surfpool Integration](#surfpool-integration)
4. [Unit Tests](#unit-tests)
5. [Integration Tests](#integration-tests)
6. [Fuzzing](#fuzzing)

---

## Setup

### Dependencies

```toml
[dev-dependencies]
litesvm = "0.3"
solana-sdk = "1.18"
spl-token = "4.0"
spl-token-2022 = "3.0"
proptest = "1.4"
```

---

## LiteSVM Configuration

```rust
use litesvm::LiteSVM;
use solana_sdk::{signature::{Keypair, Signer}, pubkey::Pubkey, transaction::Transaction};

pub fn setup_litesvm() -> LiteSVM {
    let mut svm = LiteSVM::new();
    
    // Load Morpho program
    let program_bytes = include_bytes!("../../target/deploy/morpho_solana.so");
    svm.add_program(morpho_solana::ID, program_bytes);
    
    // Add token programs
    svm.add_program_from_file(spl_token::ID, "tests/fixtures/spl_token.so").unwrap();
    svm.add_program_from_file(spl_token_2022::ID, "tests/fixtures/spl_token_2022.so").unwrap();
    
    svm
}

pub fn create_funded_account(svm: &mut LiteSVM, lamports: u64) -> Keypair {
    let account = Keypair::new();
    svm.airdrop(&account.pubkey(), lamports).unwrap();
    account
}

pub struct TestEnv {
    pub svm: LiteSVM,
    pub admin: Keypair,
    pub fee_recipient: Keypair,
    pub protocol_state: Pubkey,
    pub collateral_mint: Pubkey,
    pub loan_mint: Pubkey,
}

impl TestEnv {
    pub fn new() -> Self {
        let mut svm = setup_litesvm();
        let admin = create_funded_account(&mut svm, 10_000_000_000);
        let fee_recipient = create_funded_account(&mut svm, 1_000_000_000);
        
        let (protocol_state, _) = Pubkey::find_program_address(
            &[b"morpho_v1", b"morpho_protocol"],
            &morpho_solana::ID,
        );
        
        let collateral_mint = create_mint(&mut svm, &admin, 9);
        let loan_mint = create_mint(&mut svm, &admin, 6);
        
        Self { svm, admin, fee_recipient, protocol_state, collateral_mint, loan_mint }
    }
    
    pub fn warp_time(&mut self, seconds: i64) {
        let mut clock = self.svm.get_clock();
        clock.unix_timestamp += seconds;
        self.svm.set_clock(clock);
    }
}
```

---

## Surfpool Integration

```rust
// Surfpool enables mainnet forking for realistic oracle testing
use surfpool::{Surfpool, ForkConfig};

pub async fn setup_surfpool() -> Surfpool {
    Surfpool::new(ForkConfig {
        rpc_url: "https://api.mainnet-beta.solana.com".to_string(),
        slot: Some(250_000_000),
        accounts: vec![
            "H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG".parse().unwrap(), // SOL/USD Pyth
        ],
    }).await.unwrap()
}
```

---

## Unit Tests

### Safe Math Tests

```rust
#[test]
fn test_safe_u128_to_u64() {
    assert_eq!(safe_u128_to_u64(u64::MAX as u128).unwrap(), u64::MAX);
    assert!(safe_u128_to_u64(u64::MAX as u128 + 1).is_err());
}

#[test]
fn test_share_roundtrip() {
    let assets = 1000u128;
    let shares = to_shares_down(assets, 0, 0).unwrap();
    let recovered = to_assets_down(shares, assets, shares).unwrap();
    assert!(recovered <= assets);
}

#[test]
fn test_inflation_attack_protection() {
    // Virtual offset prevents attacker from stealing via share inflation
    let attacker_deposit = 1;
    let attacker_shares = to_shares_down(attacker_deposit, 0, 0).unwrap();
    
    let donated = 1_000_000;
    let victim_deposit = 1_000_000;
    let victim_shares = to_shares_down(
        victim_deposit,
        attacker_deposit + donated,
        attacker_shares,
    ).unwrap();
    
    assert!(victim_shares > 0); // Victim gets meaningful shares
}
```

---

## Integration Tests

### Initialize Protocol

```rust
#[test]
fn test_initialize() {
    let mut env = TestEnv::new();
    env.initialize_protocol().unwrap();
    
    let state = env.svm.get_account(&env.protocol_state).unwrap().unwrap();
    let decoded: ProtocolState = ProtocolState::try_deserialize(&mut state.data.as_slice()).unwrap();
    
    assert_eq!(decoded.owner, env.admin.pubkey());
    assert!(!decoded.paused);
}
```

### Full Lending Flow

```rust
#[test]
fn test_full_cycle() {
    let mut env = TestEnv::new();
    env.setup_full_environment().unwrap();
    
    let supplier = create_funded_account(&mut env.svm, 10_000_000_000);
    let borrower = create_funded_account(&mut env.svm, 10_000_000_000);
    
    // 1. Supply
    env.supply(&env.market_id, &supplier, 10_000_000_000, 0).unwrap();
    
    // 2. Borrow with collateral
    env.supply_collateral(&env.market_id, &borrower, 15_000_000_000).unwrap();
    env.borrow(&env.market_id, &borrower, 8_000_000_000, 0).unwrap();
    
    // 3. Time passes
    env.warp_time(30 * 86400);
    env.accrue_interest(&env.market_id).unwrap();
    
    // 4. Repay and withdraw
    env.repay(&env.market_id, &borrower, u128::MAX, 0).unwrap();
    env.withdraw_collateral(&env.market_id, &borrower, 15_000_000_000).unwrap();
    
    // 5. Supplier withdraws with profit
    let withdrawn = env.withdraw(&env.market_id, &supplier, 0, u128::MAX).unwrap();
    assert!(withdrawn > 10_000_000_000); // Profit from interest
}
```

### Liquidation

```rust
#[test]
fn test_liquidation() {
    let mut env = TestEnv::new();
    env.setup_with_position_at_80_percent().unwrap();
    
    // Price drop makes position liquidatable
    env.set_oracle_price(env.original_price * 90 / 100);
    assert!(env.is_liquidatable(&env.borrower).unwrap());
    
    let liquidator = create_funded_account(&mut env.svm, 10_000_000_000);
    let seized = env.liquidate(&liquidator, &env.borrower, 4_000_000_000).unwrap();
    
    // Liquidator receives collateral bonus
    assert!(seized > 4_000_000_000);
}
```

---

## Fuzzing

```rust
use proptest::prelude::*;

proptest! {
    #[test]
    fn fuzz_safe_conversion(value in 0u128..=u128::MAX) {
        let result = safe_u128_to_u64(value);
        if value <= u64::MAX as u128 {
            prop_assert!(result.is_ok());
        } else {
            prop_assert!(result.is_err());
        }
    }
    
    #[test]
    fn fuzz_share_math(
        assets in 1u128..1_000_000_000_000u128,
        total_assets in 0u128..1_000_000_000_000_000u128,
        total_shares in 0u128..1_000_000_000_000_000u128,
    ) {
        let shares = to_shares_down(assets, total_assets, total_shares);
        if let Ok(shares) = shares {
            let recovered = to_assets_down(
                shares,
                total_assets.saturating_add(assets),
                total_shares.saturating_add(shares),
            );
            if let Ok(recovered) = recovered {
                prop_assert!(recovered <= assets);
            }
        }
    }
}
```

---

## Test Helpers

```rust
pub fn create_mint(svm: &mut LiteSVM, authority: &Keypair, decimals: u8) -> Pubkey {
    let mint = Keypair::new();
    let rent = svm.get_rent().minimum_balance(spl_token::state::Mint::LEN);
    
    let tx = Transaction::new_signed_with_payer(
        &[
            system_instruction::create_account(
                &authority.pubkey(), &mint.pubkey(), rent,
                spl_token::state::Mint::LEN as u64, &spl_token::ID,
            ),
            spl_token::instruction::initialize_mint(
                &spl_token::ID, &mint.pubkey(), &authority.pubkey(), None, decimals,
            ).unwrap(),
        ],
        Some(&authority.pubkey()),
        &[authority, &mint],
        svm.latest_blockhash(),
    );
    
    svm.send_transaction(tx).unwrap();
    mint.pubkey()
}

pub fn derive_market_id(
    collateral_mint: &Pubkey,
    loan_mint: &Pubkey,
    oracle: &Pubkey,
    irm: &Pubkey,
    lltv: u64,
) -> [u8; 32] {
    use solana_sdk::keccak;
    let mut data = Vec::new();
    data.extend_from_slice(collateral_mint.as_ref());
    data.extend_from_slice(loan_mint.as_ref());
    data.extend_from_slice(oracle.as_ref());
    data.extend_from_slice(irm.as_ref());
    data.extend_from_slice(&lltv.to_le_bytes());
    keccak::hash(&data).to_bytes()
}
```
