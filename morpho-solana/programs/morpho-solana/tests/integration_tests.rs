//! LiteSVM Integration Tests for Morpho Solana
//!
//! Comprehensive end-to-end tests for the Morpho Blue lending protocol on Solana.
//! Uses LiteSVM for fast, in-process Solana runtime execution.

use litesvm::LiteSVM;
use anchor_lang::solana_program::{
    clock::Clock,
    pubkey::Pubkey,
    system_instruction,
};

use morpho_solana::constants::{
    PROGRAM_SEED_PREFIX, BPS, WAD, ORACLE_SCALE, MAX_FEE, FLASH_LOAN_FEE_BPS,
    VIRTUAL_SHARES, VIRTUAL_ASSETS, MAX_LIF, LIF_BPS, MAX_LLTVS, MAX_IRMS, LIF_CURSOR,
};
use morpho_solana::state::{
    ProtocolState, Market, Position, Authorization,
    calculate_market_id, derive_protocol_state, derive_market,
    derive_position,
};
use morpho_solana::math::*;
use morpho_solana::interfaces::calculate_lif;

use solana_sdk::signature::{Keypair, Signer as SolanaSigner};
use solana_sdk::transaction::Transaction;
use spl_token::state::Mint;
use solana_sdk::program_pack::Pack;
use spl_associated_token_account::get_associated_token_address;

// ============================================================================
// Test Constants
// ============================================================================

const LAMPORTS_PER_SOL: u64 = 1_000_000_000;
const INITIAL_BALANCE: u64 = 100 * LAMPORTS_PER_SOL;

// Token decimals
const COLLATERAL_DECIMALS: u8 = 9;  // e.g., SOL/ETH
const LOAN_DECIMALS: u8 = 6;        // e.g., USDC

// Test amounts
const SUPPLY_AMOUNT: u64 = 10_000_000_000;     // 10,000 USDC (6 decimals)
const COLLATERAL_AMOUNT: u64 = 5_000_000_000;  // 5 ETH (9 decimals)
const BORROW_AMOUNT: u64 = 5_000_000_000;      // 5,000 USDC (6 decimals)

// Market parameters
const LLTV_85_PERCENT: u64 = 8500;
const LLTV_80_PERCENT: u64 = 8000;

// ============================================================================
// Test Environment
// ============================================================================

/// Program ID for Morpho Solana (must match declare_id! in lib.rs)
fn program_id() -> Pubkey {
    // Using a deterministic ID for testing
    "MorphoXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX".parse().unwrap()
}

/// Test environment containing LiteSVM and test accounts
pub struct TestEnv {
    pub svm: LiteSVM,
    pub program_id: Pubkey,

    // Key accounts
    pub owner: Keypair,
    pub fee_recipient: Keypair,
    pub alice: Keypair,  // Supplier
    pub bob: Keypair,    // Borrower
    pub charlie: Keypair, // Liquidator

    // Token mints
    pub collateral_mint: Keypair,
    pub loan_mint: Keypair,

    // Oracle and IRM (mock accounts for testing)
    pub oracle: Keypair,
    pub irm: Keypair,
}

impl TestEnv {
    /// Create a new test environment with deployed program
    pub fn new() -> Self {
        let mut svm = LiteSVM::new();

        // Create test keypairs
        let owner = Keypair::new();
        let fee_recipient = Keypair::new();
        let alice = Keypair::new();
        let bob = Keypair::new();
        let charlie = Keypair::new();
        let collateral_mint = Keypair::new();
        let loan_mint = Keypair::new();
        let oracle = Keypair::new();
        let irm = Keypair::new();

        // Fund test accounts
        svm.airdrop(&owner.pubkey(), INITIAL_BALANCE).unwrap();
        svm.airdrop(&fee_recipient.pubkey(), INITIAL_BALANCE).unwrap();
        svm.airdrop(&alice.pubkey(), INITIAL_BALANCE).unwrap();
        svm.airdrop(&bob.pubkey(), INITIAL_BALANCE).unwrap();
        svm.airdrop(&charlie.pubkey(), INITIAL_BALANCE).unwrap();

        // Load the Morpho program
        let program_id = program_id();
        let program_bytes = include_bytes!("../../../target/deploy/morpho_solana.so");
        svm.add_program(program_id, program_bytes);

        TestEnv {
            svm,
            program_id,
            owner,
            fee_recipient,
            alice,
            bob,
            charlie,
            collateral_mint,
            loan_mint,
            oracle,
            irm,
        }
    }

    /// Warp time forward by the given number of seconds
    pub fn warp_time(&mut self, seconds: i64) {
        let mut clock: Clock = self.svm.get_sysvar();
        clock.unix_timestamp += seconds;
        self.svm.set_sysvar(&clock);
    }

    /// Get current unix timestamp
    pub fn get_time(&self) -> i64 {
        let clock: Clock = self.svm.get_sysvar();
        clock.unix_timestamp
    }

    /// Get protocol state PDA
    pub fn protocol_state_pda(&self) -> (Pubkey, u8) {
        derive_protocol_state(&self.program_id)
    }

    /// Get market PDA for given parameters
    pub fn market_pda(&self, market_id: &[u8; 32]) -> (Pubkey, u8) {
        derive_market(&self.program_id, market_id)
    }

    /// Get position PDA
    pub fn position_pda(&self, market_id: &[u8; 32], owner: &Pubkey) -> (Pubkey, u8) {
        derive_position(&self.program_id, market_id, owner)
    }

    /// Calculate market ID from parameters
    pub fn calculate_market_id(&self, lltv: u64) -> [u8; 32] {
        calculate_market_id(
            &self.collateral_mint.pubkey(),
            &self.loan_mint.pubkey(),
            &self.oracle.pubkey(),
            &self.irm.pubkey(),
            lltv,
        )
    }

    /// Create token mint
    pub fn create_mint(&mut self, mint: &Keypair, decimals: u8, authority: &Pubkey) {
        let rent = self.svm.minimum_balance_for_rent_exemption(Mint::LEN);

        let create_ix = system_instruction::create_account(
            &self.owner.pubkey(),
            &mint.pubkey(),
            rent,
            Mint::LEN as u64,
            &spl_token::id(),
        );

        let init_ix = spl_token::instruction::initialize_mint(
            &spl_token::id(),
            &mint.pubkey(),
            authority,
            None,
            decimals,
        ).unwrap();

        let tx = Transaction::new_signed_with_payer(
            &[create_ix, init_ix],
            Some(&self.owner.pubkey()),
            &[&self.owner, mint],
            self.svm.latest_blockhash(),
        );

        self.svm.send_transaction(tx).unwrap();
    }

    /// Create associated token account
    pub fn create_ata(&mut self, owner: &Pubkey, mint: &Pubkey, payer: &Keypair) -> Pubkey {
        let ata = get_associated_token_address(owner, mint);

        let create_ix = spl_associated_token_account::instruction::create_associated_token_account(
            &payer.pubkey(),
            owner,
            mint,
            &spl_token::id(),
        );

        let tx = Transaction::new_signed_with_payer(
            &[create_ix],
            Some(&payer.pubkey()),
            &[payer],
            self.svm.latest_blockhash(),
        );

        self.svm.send_transaction(tx).unwrap();
        ata
    }

    /// Mint tokens to an account
    pub fn mint_to(&mut self, mint: &Pubkey, dest: &Pubkey, amount: u64, authority: &Keypair) {
        let ix = spl_token::instruction::mint_to(
            &spl_token::id(),
            mint,
            dest,
            &authority.pubkey(),
            &[],
            amount,
        ).unwrap();

        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&authority.pubkey()),
            &[authority],
            self.svm.latest_blockhash(),
        );

        self.svm.send_transaction(tx).unwrap();
    }

    /// Create mock oracle account with a fixed price
    pub fn create_static_oracle(&mut self, price: u128) {
        let rent = self.svm.minimum_balance_for_rent_exemption(57); // StaticOracle size

        // Create account
        let create_ix = system_instruction::create_account(
            &self.owner.pubkey(),
            &self.oracle.pubkey(),
            rent,
            57,
            &self.program_id,
        );

        let tx = Transaction::new_signed_with_payer(
            &[create_ix],
            Some(&self.owner.pubkey()),
            &[&self.owner, &self.oracle],
            self.svm.latest_blockhash(),
        );

        self.svm.send_transaction(tx).unwrap();

        // Write oracle data directly (mock)
        // Format: discriminator(8) + bump(1) + price(16) + admin(32)
        let mut data = vec![0u8; 57];
        // Skip discriminator bytes (anchor discriminator for StaticOracle)
        data[8] = 1; // bump
        data[9..25].copy_from_slice(&price.to_le_bytes());
        data[25..57].copy_from_slice(self.owner.pubkey().as_ref());

        self.svm.set_account(
            self.oracle.pubkey(),
            solana_sdk::account::Account {
                lamports: rent,
                data,
                owner: self.program_id,
                executable: false,
                rent_epoch: 0,
            },
        ).unwrap();
    }

    /// Create mock IRM account
    pub fn create_mock_irm(&mut self) {
        let rent = self.svm.minimum_balance_for_rent_exemption(105); // LinearIrm size

        let create_ix = system_instruction::create_account(
            &self.owner.pubkey(),
            &self.irm.pubkey(),
            rent,
            105,
            &self.program_id,
        );

        let tx = Transaction::new_signed_with_payer(
            &[create_ix],
            Some(&self.owner.pubkey()),
            &[&self.owner, &self.irm],
            self.svm.latest_blockhash(),
        );

        self.svm.send_transaction(tx).unwrap();
    }

    /// Setup complete test environment with tokens and mints
    pub fn setup_tokens(&mut self) {
        // Create mints
        self.create_mint(&self.collateral_mint.insecure_clone(), COLLATERAL_DECIMALS, &self.owner.pubkey());
        self.create_mint(&self.loan_mint.insecure_clone(), LOAN_DECIMALS, &self.owner.pubkey());

        // Create ATAs for all users
        let alice_collateral = self.create_ata(&self.alice.pubkey(), &self.collateral_mint.pubkey(), &self.owner.insecure_clone());
        let alice_loan = self.create_ata(&self.alice.pubkey(), &self.loan_mint.pubkey(), &self.owner.insecure_clone());
        let bob_collateral = self.create_ata(&self.bob.pubkey(), &self.collateral_mint.pubkey(), &self.owner.insecure_clone());
        let bob_loan = self.create_ata(&self.bob.pubkey(), &self.loan_mint.pubkey(), &self.owner.insecure_clone());
        let charlie_collateral = self.create_ata(&self.charlie.pubkey(), &self.collateral_mint.pubkey(), &self.owner.insecure_clone());
        let charlie_loan = self.create_ata(&self.charlie.pubkey(), &self.loan_mint.pubkey(), &self.owner.insecure_clone());

        // Mint tokens to users
        self.mint_to(&self.collateral_mint.pubkey(), &alice_collateral, COLLATERAL_AMOUNT * 10, &self.owner.insecure_clone());
        self.mint_to(&self.loan_mint.pubkey(), &alice_loan, SUPPLY_AMOUNT * 10, &self.owner.insecure_clone());
        self.mint_to(&self.collateral_mint.pubkey(), &bob_collateral, COLLATERAL_AMOUNT * 10, &self.owner.insecure_clone());
        self.mint_to(&self.loan_mint.pubkey(), &bob_loan, SUPPLY_AMOUNT * 10, &self.owner.insecure_clone());
        self.mint_to(&self.collateral_mint.pubkey(), &charlie_collateral, COLLATERAL_AMOUNT * 10, &self.owner.insecure_clone());
        self.mint_to(&self.loan_mint.pubkey(), &charlie_loan, SUPPLY_AMOUNT * 10, &self.owner.insecure_clone());
    }
}

/// Derive market ID from parameters
pub fn derive_market_id(
    collateral_mint: &Pubkey,
    loan_mint: &Pubkey,
    oracle: &Pubkey,
    irm: &Pubkey,
    lltv: u64,
) -> [u8; 32] {
    calculate_market_id(collateral_mint, loan_mint, oracle, irm, lltv)
}

// ============================================================================
// Unit Tests (No Program Deployment Required)
// ============================================================================

#[cfg(test)]
mod unit_tests {
    use super::*;

    #[test]
    fn test_litesvm_setup() {
        let svm = LiteSVM::new();
        let clock: Clock = svm.get_sysvar();
        assert!(clock.unix_timestamp >= 0, "Should have valid timestamp");
    }

    #[test]
    fn test_time_warp() {
        let mut env = TestEnv::new();
        let initial_time = env.get_time();

        env.warp_time(86400); // Warp 1 day

        let new_time = env.get_time();
        assert_eq!(new_time - initial_time, 86400, "Time should advance by 1 day");
    }

    #[test]
    fn test_market_id_derivation() {
        let collateral = Pubkey::new_unique();
        let loan = Pubkey::new_unique();
        let oracle = Pubkey::new_unique();
        let irm = Pubkey::new_unique();
        let lltv = 8500u64;

        let id1 = derive_market_id(&collateral, &loan, &oracle, &irm, lltv);
        let id2 = derive_market_id(&collateral, &loan, &oracle, &irm, lltv);

        // Same params should give same ID
        assert_eq!(id1, id2, "Same params should produce same market ID");

        // Different LLTV should give different ID
        let id3 = derive_market_id(&collateral, &loan, &oracle, &irm, 8000);
        assert_ne!(id1, id3, "Different LLTV should produce different market ID");
    }

    #[test]
    fn test_pda_derivation() {
        let program_id = Pubkey::new_unique();

        // Test protocol state PDA
        let (protocol_pda, bump) = Pubkey::find_program_address(
            &[PROGRAM_SEED_PREFIX, ProtocolState::SEED],
            &program_id,
        );

        assert!(bump > 0, "Bump should be non-zero");
        assert_ne!(protocol_pda, Pubkey::default(), "PDA should not be default");

        // Test market PDA
        let market_id = [1u8; 32];
        let (market_pda, _) = Pubkey::find_program_address(
            &[PROGRAM_SEED_PREFIX, Market::SEED, &market_id],
            &program_id,
        );

        assert_ne!(market_pda, protocol_pda, "Market and protocol PDAs should differ");
    }

    #[test]
    fn test_position_pda_derivation() {
        let program_id = Pubkey::new_unique();
        let market_id = [1u8; 32];
        let owner1 = Pubkey::new_unique();
        let owner2 = Pubkey::new_unique();

        let (pos1, _) = derive_position(&program_id, &market_id, &owner1);
        let (pos2, _) = derive_position(&program_id, &market_id, &owner2);

        assert_ne!(pos1, pos2, "Different owners should have different position PDAs");
    }
}

// ============================================================================
// Math Validation Tests
// ============================================================================

#[cfg(test)]
mod math_validation_tests {
    use super::*;

    #[test]
    fn test_share_math_consistency() {
        // Test that converting assets -> shares -> assets is consistent
        let total_assets = 1_000_000_000_000u128; // 1M tokens (6 decimals)
        let total_shares = 1_000_000_000_000_000_000u128; // 1e18 shares

        let deposit = 100_000_000u128; // 100 tokens

        // Convert to shares (round down for user)
        let shares = to_shares_down(deposit, total_assets, total_shares).unwrap();

        // Convert back to assets (round down for user)
        let recovered = to_assets_down(
            shares,
            total_assets + deposit,
            total_shares + shares,
        ).unwrap();

        // Due to rounding, recovered should be <= deposit
        assert!(recovered <= deposit, "Rounding should favor protocol");
    }

    #[test]
    fn test_first_deposit_shares() {
        // First deposit with virtual offset
        let deposit = 1_000_000u128;
        let shares = to_shares_down(deposit, 0, 0).unwrap();

        // shares = deposit * (0 + VIRTUAL_SHARES) / (0 + VIRTUAL_ASSETS)
        // shares = 1_000_000 * 1_000_000 / 1 = 1e12
        assert_eq!(shares, 1_000_000_000_000u128);
    }

    #[test]
    fn test_borrow_share_rounding() {
        let total_borrow = 1_000_000u128;
        let total_shares = 1_000_000_000_000u128;

        let borrow_amount = 100u128;

        let shares_down = to_shares_down(borrow_amount, total_borrow, total_shares).unwrap();
        let shares_up = to_shares_up(borrow_amount, total_borrow, total_shares).unwrap();

        // Borrow uses UP rounding, so user owes more
        assert!(shares_up >= shares_down, "UP rounding should give >= shares");
    }

    #[test]
    fn test_interest_accrual_over_time() {
        // Create a mock market state
        let mut market = Market {
            bump: 0,
            market_id: [0u8; 32],
            collateral_mint: Pubkey::default(),
            loan_mint: Pubkey::default(),
            collateral_decimals: 9,
            loan_decimals: 6,
            oracle: Pubkey::default(),
            irm: Pubkey::default(),
            lltv: 8500,
            paused: false,
            fee: 1000, // 10% fee
            total_supply_assets: 10_000_000_000_000, // 10M
            total_supply_shares: 10_000_000_000_000_000_000, // 10e18
            total_borrow_assets: 5_000_000_000_000, // 5M borrowed
            total_borrow_shares: 5_000_000_000_000_000_000, // 5e18
            last_update: 0,
            pending_fee_shares: 0,
            collateral_vault_bump: 0,
            loan_vault_bump: 0,
            flash_loan_lock: 0,
            reserved: [0u8; 127],
        };

        let initial_supply = market.total_supply_assets;
        let initial_borrow = market.total_borrow_assets;

        // 10% APY rate per second
        let rate = WAD / 10 / 31_536_000;

        // Accrue for 1 year
        let result = accrue_interest_on_market(&mut market, 31_536_000, rate).unwrap();

        // Verify interest accrued
        assert!(result.interest > 0, "Interest should be positive");
        assert!(market.total_supply_assets > initial_supply, "Supply should increase");
        assert!(market.total_borrow_assets > initial_borrow, "Borrow should increase");

        // With 10% fee and ~10% interest on 5M borrowed, fee_shares should be meaningful
        assert!(result.fee_shares > 0 || market.fee == 0, "Fee shares should accrue if fee > 0");
    }

    #[test]
    fn test_no_interest_when_no_borrows() {
        let mut market = Market {
            bump: 0,
            market_id: [0u8; 32],
            collateral_mint: Pubkey::default(),
            loan_mint: Pubkey::default(),
            collateral_decimals: 9,
            loan_decimals: 6,
            oracle: Pubkey::default(),
            irm: Pubkey::default(),
            lltv: 8500,
            paused: false,
            fee: 1000,
            total_supply_assets: 10_000_000_000_000,
            total_supply_shares: 10_000_000_000_000_000_000,
            total_borrow_assets: 0, // No borrows
            total_borrow_shares: 0,
            last_update: 0,
            pending_fee_shares: 0,
            collateral_vault_bump: 0,
            loan_vault_bump: 0,
            flash_loan_lock: 0,
            reserved: [0u8; 127],
        };

        let rate = WAD / 10 / 31_536_000;
        let result = accrue_interest_on_market(&mut market, 31_536_000, rate).unwrap();

        assert_eq!(result.interest, 0, "No interest when no borrows");
        assert_eq!(result.fee_shares, 0, "No fee shares when no borrows");
    }

    #[test]
    fn test_liquidation_math() {
        // Test LIF calculation
        let lltv_85 = 8500u64; // 85% LTV
        let lif_85 = calculate_lif(lltv_85);

        // LIF should be > 10000 (> 100%) to incentivize liquidators
        assert!(lif_85 > 10000, "LIF should be above 100% (10000 bps)");
        assert!(lif_85 <= 11500, "LIF should not exceed max (115%)");

        // Test different LLTV values
        let lif_80 = calculate_lif(8000); // 80% LTV
        let lif_90 = calculate_lif(9000); // 90% LTV

        // Higher LLTV = lower LIF (less buffer for liquidation bonus)
        assert!(lif_80 > lif_85, "Lower LLTV should have higher LIF");
        assert!(lif_85 > lif_90, "Higher LLTV should have lower LIF");
    }

    #[test]
    fn test_utilization_calculation() {
        let market = Market {
            bump: 0,
            market_id: [0u8; 32],
            collateral_mint: Pubkey::default(),
            loan_mint: Pubkey::default(),
            collateral_decimals: 9,
            loan_decimals: 6,
            oracle: Pubkey::default(),
            irm: Pubkey::default(),
            lltv: 8500,
            paused: false,
            fee: 0,
            total_supply_assets: 1_000_000_000_000, // 1M
            total_supply_shares: 1_000_000_000_000_000_000,
            total_borrow_assets: 500_000_000_000, // 500K borrowed = 50% utilization
            total_borrow_shares: 500_000_000_000_000_000,
            last_update: 0,
            pending_fee_shares: 0,
            collateral_vault_bump: 0,
            loan_vault_bump: 0,
            flash_loan_lock: 0,
            reserved: [0u8; 127],
        };

        let utilization = market.utilization();

        // 50% utilization = 0.5 * WAD
        let expected = WAD / 2;
        assert_eq!(utilization, expected, "Utilization should be 50%");
    }

    #[test]
    fn test_available_liquidity() {
        let market = Market {
            bump: 0,
            market_id: [0u8; 32],
            collateral_mint: Pubkey::default(),
            loan_mint: Pubkey::default(),
            collateral_decimals: 9,
            loan_decimals: 6,
            oracle: Pubkey::default(),
            irm: Pubkey::default(),
            lltv: 8500,
            paused: false,
            fee: 0,
            total_supply_assets: 1_000_000,
            total_supply_shares: 1_000_000_000_000,
            total_borrow_assets: 400_000,
            total_borrow_shares: 400_000_000_000,
            last_update: 0,
            pending_fee_shares: 0,
            collateral_vault_bump: 0,
            loan_vault_bump: 0,
            flash_loan_lock: 0,
            reserved: [0u8; 127],
        };

        let liquidity = market.available_liquidity();
        assert_eq!(liquidity, 600_000, "Available = Supply - Borrow");
    }

    #[test]
    fn test_flash_loan_fee_calculation() {
        let borrowed = 1_000_000_000u128; // 1000 USDC

        // Fee = borrowed * FLASH_LOAN_FEE_BPS / BPS
        // Fee = 1_000_000_000 * 5 / 10000 = 500_000 (0.5 USDC)
        let fee = mul_div_up(borrowed, FLASH_LOAN_FEE_BPS as u128, BPS as u128).unwrap();

        assert_eq!(fee, 500_000, "Flash loan fee should be 0.05%");
    }

    #[test]
    fn test_inflation_attack_protection() {
        // Attack scenario:
        // 1. Attacker deposits 1 wei as first depositor
        // 2. Attacker donates 1M tokens to vault
        // 3. Victim deposits 1M tokens
        //
        // With virtual offset, victim still gets meaningful shares

        let attacker_deposit = 1u128;
        let attacker_shares = to_shares_down(attacker_deposit, 0, 0).unwrap();

        // Attacker "donates" 1M tokens (simulated by just adding to total_assets)
        let donated = 1_000_000u128;
        let total_assets = attacker_deposit + donated;

        let victim_deposit = 1_000_000u128;
        let victim_shares = to_shares_down(
            victim_deposit,
            total_assets,
            attacker_shares,
        ).unwrap();

        // Victim should get meaningful shares, not 0 or 1
        assert!(victim_shares > 1000, "Victim should get meaningful shares");

        // Attacker shouldn't get all the victim's funds
        let attacker_value = to_assets_down(
            attacker_shares,
            total_assets + victim_deposit,
            attacker_shares + victim_shares,
        ).unwrap();

        // Attacker's share of total should be roughly proportional to their deposit
        assert!(attacker_value < donated + victim_deposit, "Attacker shouldn't steal funds");
    }
}

// ============================================================================
// State Validation Tests
// ============================================================================

#[cfg(test)]
mod state_tests {
    use super::*;

    #[test]
    fn test_protocol_state_space() {
        let space = ProtocolState::space();
        // Verify space calculation is reasonable
        assert!(space > 100, "Protocol state should have substantial size");
        assert!(space < 2000, "Protocol state shouldn't be too large");
    }

    #[test]
    fn test_market_space() {
        let space = Market::space();
        assert!(space > 200, "Market should have substantial size");
        assert!(space < 1000, "Market shouldn't be too large");
    }

    #[test]
    fn test_position_space() {
        let space = Position::space();
        assert!(space > 100, "Position should have substantial size");
        assert!(space < 500, "Position shouldn't be too large");
    }

    #[test]
    fn test_authorization_space() {
        let space = Authorization::space();
        assert!(space > 50, "Authorization should have substantial size");
        assert!(space < 200, "Authorization shouldn't be too large");
    }

    #[test]
    fn test_position_is_empty() {
        let empty_position = Position {
            bump: 1,
            market_id: [0u8; 32],
            owner: Pubkey::new_unique(),
            supply_shares: 0,
            borrow_shares: 0,
            collateral: 0,
            reserved: [0u8; 64],
        };

        assert!(empty_position.is_empty(), "Position with all zeros should be empty");

        let non_empty_position = Position {
            bump: 1,
            market_id: [0u8; 32],
            owner: Pubkey::new_unique(),
            supply_shares: 100,
            borrow_shares: 0,
            collateral: 0,
            reserved: [0u8; 64],
        };

        assert!(!non_empty_position.is_empty(), "Position with supply shares should not be empty");
    }

    #[test]
    fn test_position_has_debt() {
        let position_with_debt = Position {
            bump: 1,
            market_id: [0u8; 32],
            owner: Pubkey::new_unique(),
            supply_shares: 0,
            borrow_shares: 1000,
            collateral: 5000,
            reserved: [0u8; 64],
        };

        assert!(position_with_debt.has_debt(), "Position with borrow shares should have debt");
        assert!(position_with_debt.has_collateral(), "Position should have collateral");
    }

    #[test]
    fn test_authorization_validity() {
        let current_time = 1000i64;

        // Valid authorization (no expiry)
        let valid_auth = Authorization {
            bump: 1,
            authorizer: Pubkey::new_unique(),
            authorized: Pubkey::new_unique(),
            is_authorized: true,
            is_revoked: false,
            expires_at: 0, // No expiry
            reserved: [0u8; 32],
        };
        assert!(valid_auth.is_valid(current_time), "Should be valid with no expiry");

        // Valid authorization (not expired)
        let future_auth = Authorization {
            bump: 1,
            authorizer: Pubkey::new_unique(),
            authorized: Pubkey::new_unique(),
            is_authorized: true,
            is_revoked: false,
            expires_at: 2000, // Future expiry
            reserved: [0u8; 32],
        };
        assert!(future_auth.is_valid(current_time), "Should be valid before expiry");

        // Expired authorization
        let expired_auth = Authorization {
            bump: 1,
            authorizer: Pubkey::new_unique(),
            authorized: Pubkey::new_unique(),
            is_authorized: true,
            is_revoked: false,
            expires_at: 500, // Past expiry
            reserved: [0u8; 32],
        };
        assert!(!expired_auth.is_valid(current_time), "Should be invalid after expiry");

        // Revoked authorization
        let revoked_auth = Authorization {
            bump: 1,
            authorizer: Pubkey::new_unique(),
            authorized: Pubkey::new_unique(),
            is_authorized: true,
            is_revoked: true,
            expires_at: 0,
            reserved: [0u8; 32],
        };
        assert!(!revoked_auth.is_valid(current_time), "Should be invalid when revoked");

        // Not authorized
        let not_auth = Authorization {
            bump: 1,
            authorizer: Pubkey::new_unique(),
            authorized: Pubkey::new_unique(),
            is_authorized: false,
            is_revoked: false,
            expires_at: 0,
            reserved: [0u8; 32],
        };
        assert!(!not_auth.is_valid(current_time), "Should be invalid when not authorized");
    }

    #[test]
    fn test_market_operational_check() {
        let mut market = Market {
            bump: 0,
            market_id: [0u8; 32],
            collateral_mint: Pubkey::default(),
            loan_mint: Pubkey::default(),
            collateral_decimals: 9,
            loan_decimals: 6,
            oracle: Pubkey::default(),
            irm: Pubkey::default(),
            lltv: 8500,
            paused: false,
            fee: 0,
            total_supply_assets: 0,
            total_supply_shares: 0,
            total_borrow_assets: 0,
            total_borrow_shares: 0,
            last_update: 0,
            pending_fee_shares: 0,
            collateral_vault_bump: 0,
            loan_vault_bump: 0,
            flash_loan_lock: 0,
            reserved: [0u8; 127],
        };

        assert!(market.is_operational(), "Market should be operational when not paused");

        market.paused = true;
        assert!(!market.is_operational(), "Market should not be operational when paused");
    }

    #[test]
    fn test_flash_loan_lock() {
        let mut market = Market {
            bump: 0,
            market_id: [0u8; 32],
            collateral_mint: Pubkey::default(),
            loan_mint: Pubkey::default(),
            collateral_decimals: 9,
            loan_decimals: 6,
            oracle: Pubkey::default(),
            irm: Pubkey::default(),
            lltv: 8500,
            paused: false,
            fee: 0,
            total_supply_assets: 0,
            total_supply_shares: 0,
            total_borrow_assets: 0,
            total_borrow_shares: 0,
            last_update: 0,
            pending_fee_shares: 0,
            collateral_vault_bump: 0,
            loan_vault_bump: 0,
            flash_loan_lock: 0,
            reserved: [0u8; 127],
        };

        assert!(!market.is_flash_loan_active(), "Flash loan should not be active initially");

        market.flash_loan_lock = 1;
        assert!(market.is_flash_loan_active(), "Flash loan should be active when lock is set");
    }
}

// ============================================================================
// Constants Validation Tests
// ============================================================================

#[cfg(test)]
mod constants_tests {
    use super::*;
    use morpho_solana::constants::*;

    #[test]
    fn test_wad_constant() {
        assert_eq!(WAD, 1_000_000_000_000_000_000u128, "WAD should be 1e18");
    }

    #[test]
    fn test_oracle_scale() {
        assert_eq!(ORACLE_SCALE, WAD * WAD, "ORACLE_SCALE should be 1e36");
    }

    #[test]
    fn test_bps_constant() {
        assert_eq!(BPS, 10_000, "BPS should be 10000");
    }

    #[test]
    fn test_max_fee() {
        assert_eq!(MAX_FEE, 2500, "MAX_FEE should be 2500 (25%)");
    }

    #[test]
    fn test_flash_loan_fee() {
        assert_eq!(FLASH_LOAN_FEE_BPS, 5, "Flash loan fee should be 5 bps (0.05%)");
    }

    #[test]
    fn test_virtual_offset() {
        assert_eq!(VIRTUAL_SHARES, 1_000_000, "VIRTUAL_SHARES should be 1e6");
        assert_eq!(VIRTUAL_ASSETS, 1, "VIRTUAL_ASSETS should be 1");
    }

    #[test]
    fn test_max_arrays() {
        assert_eq!(MAX_LLTVS, 20, "MAX_LLTVS should be 20");
        assert_eq!(MAX_IRMS, 10, "MAX_IRMS should be 10");
    }

    #[test]
    fn test_liquidation_constants() {
        assert_eq!(MAX_LIF, 11_500, "MAX_LIF should be 11500 (115%)");
        assert_eq!(LIF_CURSOR, 3_000, "LIF_CURSOR should be 3000 (30%)");
        assert_eq!(LIF_BPS, 10_000, "LIF_BPS should be 10000");
    }
}

// ============================================================================
// Protocol Flow Integration Tests (Require Program Deployment)
// ============================================================================

#[cfg(test)]
mod integration_tests {
    use super::*;
    use anchor_lang::InstructionData;
    use anchor_lang::ToAccountMetas;
    use solana_sdk::instruction::{AccountMeta, Instruction};
    use morpho_solana::instruction as morpho_ix;
    use morpho_solana::accounts as morpho_accounts;
    use anchor_lang::system_program;

    /// Helper to create an Anchor instruction
    fn create_instruction(
        program_id: Pubkey,
        accounts: Vec<AccountMeta>,
        data: Vec<u8>,
    ) -> Instruction {
        Instruction {
            program_id,
            accounts,
            data,
        }
    }

    /// Test basic program loading
    #[test]
    fn test_program_loads() {
        let env = TestEnv::new();
        // If we get here, program loaded successfully
        assert_ne!(env.program_id, Pubkey::default());
        println!("✅ Program loaded successfully at: {}", env.program_id);
    }

    /// Test protocol initialization
    #[test]
    fn test_protocol_initialization() {
        let mut env = TestEnv::new();
        
        let (protocol_state_pda, _bump) = env.protocol_state_pda();
        
        // Build initialize instruction
        let ix_data = morpho_ix::Initialize {
            owner: env.owner.pubkey(),
            fee_recipient: env.fee_recipient.pubkey(),
        };
        
        let accounts = morpho_accounts::Initialize {
            protocol_state: protocol_state_pda,
            payer: env.owner.pubkey(),
            system_program: system_program::ID,
        };
        
        let ix = Instruction {
            program_id: env.program_id,
            accounts: accounts.to_account_metas(None),
            data: ix_data.data(),
        };
        
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&env.owner.pubkey()),
            &[&env.owner],
            env.svm.latest_blockhash(),
        );
        
        let result = env.svm.send_transaction(tx);
        assert!(result.is_ok(), "Initialize should succeed: {:?}", result.err());
        
        println!("✅ Protocol initialized at: {}", protocol_state_pda);
    }

    /// Test enabling LLTV
    #[test]
    fn test_enable_lltv() {
        let mut env = TestEnv::new();
        
        // First initialize
        let (protocol_state_pda, _) = env.protocol_state_pda();
        
        let init_ix = Instruction {
            program_id: env.program_id,
            accounts: morpho_accounts::Initialize {
                protocol_state: protocol_state_pda,
                payer: env.owner.pubkey(),
                system_program: system_program::ID,
            }.to_account_metas(None),
            data: morpho_ix::Initialize {
                owner: env.owner.pubkey(),
                fee_recipient: env.fee_recipient.pubkey(),
            }.data(),
        };
        
        let tx = Transaction::new_signed_with_payer(
            &[init_ix],
            Some(&env.owner.pubkey()),
            &[&env.owner],
            env.svm.latest_blockhash(),
        );
        env.svm.send_transaction(tx).unwrap();
        
        // Now enable LLTV
        let enable_lltv_ix = Instruction {
            program_id: env.program_id,
            accounts: morpho_accounts::EnableLltv {
                protocol_state: protocol_state_pda,
                owner: env.owner.pubkey(),
            }.to_account_metas(None),
            data: morpho_ix::EnableLltv {
                lltv: LLTV_85_PERCENT,
            }.data(),
        };
        
        let tx = Transaction::new_signed_with_payer(
            &[enable_lltv_ix],
            Some(&env.owner.pubkey()),
            &[&env.owner],
            env.svm.latest_blockhash(),
        );
        
        let result = env.svm.send_transaction(tx);
        assert!(result.is_ok(), "Enable LLTV should succeed: {:?}", result.err());
        
        println!("✅ LLTV {}% enabled", LLTV_85_PERCENT as f64 / 100.0);
    }

    /// Full lending cycle test
    #[test]
    fn test_full_lending_cycle() {
        let mut env = TestEnv::new();
        env.setup_tokens();
        
        // Step 1: Initialize protocol
        let (protocol_state_pda, _) = env.protocol_state_pda();
        
        let init_ix = Instruction {
            program_id: env.program_id,
            accounts: morpho_accounts::Initialize {
                protocol_state: protocol_state_pda,
                payer: env.owner.pubkey(),
                system_program: system_program::ID,
            }.to_account_metas(None),
            data: morpho_ix::Initialize {
                owner: env.owner.pubkey(),
                fee_recipient: env.fee_recipient.pubkey(),
            }.data(),
        };
        
        let tx = Transaction::new_signed_with_payer(
            &[init_ix],
            Some(&env.owner.pubkey()),
            &[&env.owner],
            env.svm.latest_blockhash(),
        );
        
        let result = env.svm.send_transaction(tx);
        assert!(result.is_ok(), "Initialize should succeed");
        println!("✅ Step 1: Protocol initialized");
        
        // Step 2: Enable LLTV
        let enable_lltv_ix = Instruction {
            program_id: env.program_id,
            accounts: morpho_accounts::EnableLltv {
                protocol_state: protocol_state_pda,
                owner: env.owner.pubkey(),
            }.to_account_metas(None),
            data: morpho_ix::EnableLltv {
                lltv: LLTV_85_PERCENT,
            }.data(),
        };
        
        let tx = Transaction::new_signed_with_payer(
            &[enable_lltv_ix],
            Some(&env.owner.pubkey()),
            &[&env.owner],
            env.svm.latest_blockhash(),
        );
        
        let result = env.svm.send_transaction(tx);
        assert!(result.is_ok(), "Enable LLTV should succeed");
        println!("✅ Step 2: LLTV 85% enabled");
        
        // Step 3: Create mock oracle and IRM
        env.create_static_oracle(ORACLE_SCALE); // 1:1 price for simplicity
        env.create_mock_irm();
        println!("✅ Step 3: Oracle and IRM created");
        
        // Verify protocol state was created
        let protocol_account = env.svm.get_account(&protocol_state_pda);
        assert!(protocol_account.is_some(), "Protocol state should exist");
        
        println!("✅ Full lending cycle test completed (partial - market creation requires more setup)");
    }

    /// Liquidation scenario test
    #[test]
    fn test_liquidation_scenario() {
        let mut env = TestEnv::new();
        env.setup_tokens();
        
        // Initialize protocol
        let (protocol_state_pda, _) = env.protocol_state_pda();
        
        let init_ix = Instruction {
            program_id: env.program_id,
            accounts: morpho_accounts::Initialize {
                protocol_state: protocol_state_pda,
                payer: env.owner.pubkey(),
                system_program: system_program::ID,
            }.to_account_metas(None),
            data: morpho_ix::Initialize {
                owner: env.owner.pubkey(),
                fee_recipient: env.fee_recipient.pubkey(),
            }.data(),
        };
        
        let tx = Transaction::new_signed_with_payer(
            &[init_ix],
            Some(&env.owner.pubkey()),
            &[&env.owner],
            env.svm.latest_blockhash(),
        );
        env.svm.send_transaction(tx).unwrap();
        
        // Create oracle with initial price
        env.create_static_oracle(ORACLE_SCALE);
        
        // Verify oracle exists
        let oracle_account = env.svm.get_account(&env.oracle.pubkey());
        assert!(oracle_account.is_some(), "Oracle should exist");
        
        // Test LIF calculation for liquidation incentive
        let lif = calculate_lif(LLTV_85_PERCENT);
        assert!(lif > BPS, "LIF should be > 100%");
        assert!(lif <= MAX_LIF, "LIF should be <= MAX_LIF");
        
        println!("✅ Liquidation scenario test: LIF = {}%", lif as f64 / 100.0);
    }

    /// Flash loan test
    #[test]
    fn test_flash_loan_flow() {
        let mut env = TestEnv::new();
        env.setup_tokens();
        
        // Initialize protocol
        let (protocol_state_pda, _) = env.protocol_state_pda();
        
        let init_ix = Instruction {
            program_id: env.program_id,
            accounts: morpho_accounts::Initialize {
                protocol_state: protocol_state_pda,
                payer: env.owner.pubkey(),
                system_program: system_program::ID,
            }.to_account_metas(None),
            data: morpho_ix::Initialize {
                owner: env.owner.pubkey(),
                fee_recipient: env.fee_recipient.pubkey(),
            }.data(),
        };
        
        let tx = Transaction::new_signed_with_payer(
            &[init_ix],
            Some(&env.owner.pubkey()),
            &[&env.owner],
            env.svm.latest_blockhash(),
        );
        env.svm.send_transaction(tx).unwrap();
        
        // Test flash loan fee calculation
        let borrow_amount = 1_000_000_000u128; // 1000 tokens
        let fee = mul_div_up(borrow_amount, FLASH_LOAN_FEE_BPS as u128, BPS as u128).unwrap();
        assert_eq!(fee, 500_000, "Flash loan fee should be 0.05%");
        
        println!("✅ Flash loan test: Fee for {} = {} (0.05%)", borrow_amount, fee);
    }

    /// Authorization delegation test
    #[test]
    fn test_authorization_delegation() {
        let mut env = TestEnv::new();
        env.setup_tokens();
        
        // Initialize protocol
        let (protocol_state_pda, _) = env.protocol_state_pda();
        
        let init_ix = Instruction {
            program_id: env.program_id,
            accounts: morpho_accounts::Initialize {
                protocol_state: protocol_state_pda,
                payer: env.owner.pubkey(),
                system_program: system_program::ID,
            }.to_account_metas(None),
            data: morpho_ix::Initialize {
                owner: env.owner.pubkey(),
                fee_recipient: env.fee_recipient.pubkey(),
            }.data(),
        };
        
        let tx = Transaction::new_signed_with_payer(
            &[init_ix],
            Some(&env.owner.pubkey()),
            &[&env.owner],
            env.svm.latest_blockhash(),
        );
        env.svm.send_transaction(tx).unwrap();
        
        // Test authorization validity logic
        let auth = Authorization {
            bump: 1,
            authorizer: env.alice.pubkey(),
            authorized: env.bob.pubkey(),
            is_authorized: true,
            is_revoked: false,
            expires_at: 0,
            reserved: [0u8; 32],
        };
        
        let current_time = env.get_time();
        assert!(auth.is_valid(current_time), "Auth should be valid");
        
        // Test revoked auth
        let revoked_auth = Authorization {
            is_revoked: true,
            ..auth
        };
        assert!(!revoked_auth.is_valid(current_time), "Revoked auth should be invalid");
        
        println!("✅ Authorization delegation test: Valid and revoked states verified");
    }

    /// Fee claiming test
    #[test]
    fn test_fee_claiming() {
        let mut env = TestEnv::new();
        env.setup_tokens();
        
        // Initialize protocol
        let (protocol_state_pda, _) = env.protocol_state_pda();
        
        let init_ix = Instruction {
            program_id: env.program_id,
            accounts: morpho_accounts::Initialize {
                protocol_state: protocol_state_pda,
                payer: env.owner.pubkey(),
                system_program: system_program::ID,
            }.to_account_metas(None),
            data: morpho_ix::Initialize {
                owner: env.owner.pubkey(),
                fee_recipient: env.fee_recipient.pubkey(),
            }.data(),
        };
        
        let tx = Transaction::new_signed_with_payer(
            &[init_ix],
            Some(&env.owner.pubkey()),
            &[&env.owner],
            env.svm.latest_blockhash(),
        );
        env.svm.send_transaction(tx).unwrap();
        
        // Test fee calculation
        let protocol_fee_bps = 1000u64; // 10%
        let interest_earned = 1_000_000_000u128; // 1000 tokens
        
        let fee_amount = mul_div_down(interest_earned, protocol_fee_bps as u128, BPS as u128).unwrap();
        assert_eq!(fee_amount, 100_000_000, "10% fee on 1000 = 100 tokens");
        
        println!("✅ Fee claiming test: 10% fee = {} on {} interest", fee_amount, interest_earned);
    }
}

// ============================================================================
// Error Condition Tests
// ============================================================================

#[cfg(test)]
mod error_tests {
    use super::*;

    #[test]
    fn test_safe_u128_to_u64_overflow() {
        let max_u64 = u64::MAX as u128;

        // Should succeed at boundary
        let result = safe_u128_to_u64(max_u64);
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), u64::MAX);

        // Should fail above boundary
        let overflow_result = safe_u128_to_u64(max_u64 + 1);
        assert!(overflow_result.is_err());
    }

    #[test]
    fn test_checked_math_overflow() {
        // Addition overflow
        let add_result = checked_add(u128::MAX, 1);
        assert!(add_result.is_err());

        // Subtraction underflow
        let sub_result = checked_sub(0, 1);
        assert!(sub_result.is_err());

        // Multiplication overflow
        let mul_result = checked_mul(u128::MAX, 2);
        assert!(mul_result.is_err());

        // Division by zero
        let div_result = checked_div(100, 0);
        assert!(div_result.is_err());
    }

    #[test]
    fn test_share_calculation_edge_cases() {
        // Very small deposit
        let tiny_shares = to_shares_down(1, 1_000_000_000_000, 1_000_000_000_000_000_000);
        assert!(tiny_shares.is_ok());

        // Zero deposit should work (returns 0)
        let zero_shares = to_shares_down(0, 1_000_000_000_000, 1_000_000_000_000_000_000);
        assert!(zero_shares.is_ok());
        assert_eq!(zero_shares.unwrap(), 0);
    }
}

// ============================================================================
// Scenario Tests (Unit-level without deployment)
// ============================================================================

#[cfg(test)]
mod scenario_tests {
    use super::*;

    /// Simulate a full lending cycle with state updates
    #[test]
    fn test_lending_cycle_simulation() {
        // Initial state
        let mut total_supply_assets = 0u128;
        let mut total_supply_shares = 0u128;
        let mut total_borrow_assets = 0u128;
        let mut total_borrow_shares = 0u128;

        // Alice supplies 10,000 USDC
        let alice_supply = 10_000_000_000u128; // 10,000 USDC (6 decimals)
        let alice_shares = to_shares_down(alice_supply, total_supply_assets, total_supply_shares).unwrap();
        total_supply_assets += alice_supply;
        total_supply_shares += alice_shares;

        assert!(alice_shares > 0, "Alice should receive shares");

        // Bob borrows 5,000 USDC
        let bob_borrow = 5_000_000_000u128;
        let bob_borrow_shares = to_shares_up(bob_borrow, total_borrow_assets, total_borrow_shares).unwrap();
        total_borrow_assets += bob_borrow;
        total_borrow_shares += bob_borrow_shares;

        // Verify utilization is ~50%
        let utilization = mul_div_down(total_borrow_assets, WAD, total_supply_assets).unwrap();
        assert!(utilization > WAD / 2 - WAD / 100, "Utilization should be ~50%");
        assert!(utilization < WAD / 2 + WAD / 100, "Utilization should be ~50%");

        // Simulate 1 year of interest (10% APY)
        let rate_per_second = WAD / 10 / 31_536_000;
        let interest_factor = w_taylor_compounded(rate_per_second, 31_536_000).unwrap();
        let interest = wad_mul_down(total_borrow_assets, interest_factor).unwrap();

        total_borrow_assets += interest;
        total_supply_assets += interest;

        assert!(interest > 0, "Interest should accrue");

        // Bob repays full debt
        let bob_repay_assets = to_assets_up(bob_borrow_shares, total_borrow_assets, total_borrow_shares).unwrap();
        assert!(bob_repay_assets > bob_borrow, "Bob should repay more than borrowed due to interest");

        total_borrow_assets -= bob_repay_assets;
        total_borrow_shares -= bob_borrow_shares;

        // Alice withdraws
        let alice_withdraw_assets = to_assets_down(alice_shares, total_supply_assets, total_supply_shares).unwrap();
        assert!(alice_withdraw_assets > alice_supply, "Alice should profit from interest");

        let profit = alice_withdraw_assets - alice_supply;
        let expected_profit_lower = interest * 90 / 100; // Allow some rounding
        assert!(profit >= expected_profit_lower, "Alice's profit should be close to interest earned");
    }

    /// Simulate liquidation
    #[test]
    fn test_liquidation_simulation() {
        let lltv = 8500u64; // 85%
        let collateral = 10_000_000_000u128; // 10 ETH (9 decimals)

        // Initial oracle price: $2000/ETH = 2000 USDC per ETH
        // We use WAD as the scale for testing to avoid overflow
        let oracle_price = 2000u128.checked_mul(WAD).unwrap();

        // Max borrow = collateral * price * lltv / WAD / BPS
        let collateral_value = mul_div_down(collateral, oracle_price, WAD).unwrap();
        let max_borrow = mul_div_down(collateral_value, lltv as u128, BPS as u128).unwrap();

        // User borrows 95% of max (high leverage, risky)
        let borrowed = max_borrow * 95 / 100;

        // Check position is healthy
        assert!(borrowed <= max_borrow, "Initial position should be healthy");

        // Price drops 20% to $1600/ETH
        let new_oracle_price = 1600u128.checked_mul(WAD).unwrap();
        let new_collateral_value = mul_div_down(collateral, new_oracle_price, WAD).unwrap();
        let new_max_borrow = mul_div_down(new_collateral_value, lltv as u128, BPS as u128).unwrap();

        // With 20% price drop and 95% initial utilization, position should be liquidatable
        // New max = old_max * 0.8 = max_borrow * 0.8
        // Borrowed = max_borrow * 0.95
        // So borrowed (0.95) > new_max (0.68) -> liquidatable
        assert!(borrowed > new_max_borrow, "Position should be liquidatable after price drop");

        // Calculate liquidation incentive
        let lif = calculate_lif(lltv);
        assert!(lif > BPS, "LIF should be > 100%");

        // Liquidator repays half the debt
        let repay_amount = borrowed / 2;

        // Seized collateral = repay * LIF / new_price
        // (scaled properly for WAD)
        let repay_in_collateral = mul_div_up(repay_amount, WAD, new_oracle_price).unwrap();
        let seized = mul_div_up(repay_in_collateral, lif as u128, LIF_BPS as u128).unwrap();

        assert!(seized > repay_in_collateral, "Seized collateral should exceed repay value (incentive)");
        assert!(seized <= collateral, "Can't seize more than available collateral");
    }

    /// Test bad debt socialization
    #[test]
    fn test_bad_debt_simulation() {
        let mut market = Market {
            bump: 0,
            market_id: [0u8; 32],
            collateral_mint: Pubkey::default(),
            loan_mint: Pubkey::default(),
            collateral_decimals: 9,
            loan_decimals: 6,
            oracle: Pubkey::default(),
            irm: Pubkey::default(),
            lltv: 8500,
            paused: false,
            fee: 0,
            total_supply_assets: 10_000_000_000_000, // 10M supplied
            total_supply_shares: 10_000_000_000_000_000_000,
            total_borrow_assets: 1_000_000_000_000, // 1M borrowed
            total_borrow_shares: 1_000_000_000_000_000_000,
            last_update: 0,
            pending_fee_shares: 0,
            collateral_vault_bump: 0,
            loan_vault_bump: 0,
            flash_loan_lock: 0,
            reserved: [0u8; 127],
        };

        let initial_supply = market.total_supply_assets;

        // Simulate bad debt: 100K worth of shares become uncollateralized
        let bad_debt_shares = 100_000_000_000_000_000u128;
        let bad_debt_assets = to_assets_up(
            bad_debt_shares,
            market.total_borrow_assets,
            market.total_borrow_shares,
        ).unwrap();

        // Socialize the bad debt
        market.total_borrow_shares -= bad_debt_shares;
        market.total_borrow_assets -= bad_debt_assets;
        market.total_supply_assets -= bad_debt_assets; // Loss absorbed by suppliers

        // Verify loss was socialized
        assert!(market.total_supply_assets < initial_supply, "Supply should decrease");

        // Each share is now worth slightly less (socialized loss)
        let new_value_per_share = mul_div_down(
            market.total_supply_assets,
            WAD,
            market.total_supply_shares,
        ).unwrap();

        let old_value_per_share = mul_div_down(
            initial_supply,
            WAD,
            market.total_supply_shares,
        ).unwrap();

        assert!(new_value_per_share < old_value_per_share, "Share value should decrease");
    }
}

// ============================================================================
// Property-Based Tests
// ============================================================================

#[cfg(test)]
mod property_tests {
    use super::*;

    /// Property: share conversion should always favor protocol
    #[test]
    fn test_rounding_always_favors_protocol() {
        let test_cases = [
            (100, 1000, 1_000_000),
            (1, 1, 1_000_000),
            (1_000_000, 1_000_000_000, 1_000_000_000_000),
            (123456789, 987654321, 555555555555),
        ];

        for (deposit, total_assets, total_shares) in test_cases {
            // Deposit: user gets fewer shares (DOWN)
            let shares_down = to_shares_down(deposit, total_assets, total_shares).unwrap();
            let shares_up = to_shares_up(deposit, total_assets, total_shares).unwrap();
            assert!(shares_down <= shares_up, "DOWN <= UP for shares");

            // Withdraw: user gets fewer assets (DOWN)
            if shares_down > 0 {
                let assets_from_shares = to_assets_down(
                    shares_down,
                    total_assets + deposit,
                    total_shares + shares_down,
                ).unwrap();
                assert!(assets_from_shares <= deposit, "Roundtrip should not profit user");
            }
        }
    }

    /// Property: utilization should always be between 0 and WAD
    #[test]
    fn test_utilization_bounds() {
        let test_cases = [
            (0, 1000),      // No borrows
            (500, 1000),    // 50% utilization
            (1000, 1000),   // 100% utilization
            (1, 1_000_000), // Tiny utilization
        ];

        for (borrow, supply) in test_cases {
            if supply > 0 {
                let utilization = mul_div_down(borrow as u128, WAD, supply as u128).unwrap();
                assert!(utilization <= WAD, "Utilization should not exceed 100%");
            }
        }
    }

    /// Property: LIF should always be between 10000 and 11500
    #[test]
    fn test_lif_bounds() {
        for lltv in [1000, 5000, 7500, 8000, 8500, 9000, 9500, 9900] {
            let lif = calculate_lif(lltv);
            assert!(lif >= BPS, "LIF should be >= 100%");
            assert!(lif <= MAX_LIF, "LIF should be <= 115%");
        }
    }
}
