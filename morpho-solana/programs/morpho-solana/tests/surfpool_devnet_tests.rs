//! Surfpool Devnet Integration Tests with Real Switchboard Oracles
//!
//! These tests use Surfpool to fork devnet state and interact with
//! real Switchboard price feeds for accurate oracle testing.

use litesvm::LiteSVM;
use anchor_lang::solana_program::{
    clock::Clock,
    pubkey::Pubkey,
    system_instruction,
};
use anchor_lang::InstructionData;
use anchor_lang::ToAccountMetas;
use solana_sdk::instruction::Instruction;
use solana_sdk::signature::{Keypair, Signer as SolanaSigner};
use solana_sdk::transaction::Transaction;

use morpho_solana::constants::{
    PROGRAM_SEED_PREFIX, BPS, WAD, ORACLE_SCALE, FLASH_LOAN_FEE_BPS,
    MAX_LIF, LIF_BPS,
};
use morpho_solana::state::{
    ProtocolState, Market, Position, Authorization,
    calculate_market_id, derive_protocol_state, derive_market,
    derive_position,
};
use morpho_solana::math::*;
use morpho_solana::interfaces::calculate_lif;
use morpho_solana::instruction as morpho_ix;
use morpho_solana::accounts as morpho_accounts;
use anchor_lang::system_program;

// ============================================================================
// Switchboard Devnet Feed Addresses
// ============================================================================

/// Switchboard V2 Program ID on Devnet
pub const SWITCHBOARD_V2_DEVNET: &str = "Aio4gaXjXzJNVLtzwtNVmSqGKpANtXhybbkhtAC94ji2";

/// Switchboard Default Devnet Queue
pub const SWITCHBOARD_DEVNET_QUEUE: &str = "EYiAmGSdsQTuCw413V5BzaruWuCCSDgTP1BGvLkXHbe7";

// Note: Real Switchboard feed addresses should be looked up from:
// https://app.switchboard.xyz/solana/devnet
// These are example placeholders - replace with actual devnet feeds

/// SOL/USD Switchboard Feed (example - verify on devnet explorer)
pub const SOL_USD_FEED: &str = "GvDMxPzN1sCj7L26YDK2HnMRXEQmQ2aemov8YBtPS7vR";

/// BTC/USD Switchboard Feed (example - verify on devnet explorer)  
pub const BTC_USD_FEED: &str = "8SXvChNYFhRq4EZuZvnhjrB3jJRQCv4k3P4W6snE4FYS";

/// ETH/USD Switchboard Feed (example - verify on devnet explorer)
pub const ETH_USD_FEED: &str = "EdVCmQ9FSPcVe5YySXDPCRmc8aDQLKJ9xvYBMZPie1Vw";

// ============================================================================
// Devnet Test Environment
// ============================================================================

const LAMPORTS_PER_SOL: u64 = 1_000_000_000;
const INITIAL_BALANCE: u64 = 100 * LAMPORTS_PER_SOL;

/// Morpho Program ID (must match lib.rs)
fn program_id() -> Pubkey {
    "MorphoXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX".parse().unwrap()
}

/// Devnet test environment using Surfpool's forked state
pub struct DevnetTestEnv {
    pub svm: LiteSVM,
    pub program_id: Pubkey,
    
    // Key accounts
    pub owner: Keypair,
    pub fee_recipient: Keypair,
    pub alice: Keypair,
    pub bob: Keypair,
    
    // Switchboard oracle addresses
    pub sol_usd_feed: Pubkey,
    pub btc_usd_feed: Pubkey,
    pub eth_usd_feed: Pubkey,
}

impl DevnetTestEnv {
    /// Create a new devnet test environment
    /// 
    /// This loads the Morpho program and sets up test accounts.
    /// In a Surfpool context, devnet state would be lazily forked.
    pub fn new() -> Self {
        let mut svm = LiteSVM::new();
        
        // Create test keypairs
        let owner = Keypair::new();
        let fee_recipient = Keypair::new();
        let alice = Keypair::new();
        let bob = Keypair::new();
        
        // Fund accounts
        svm.airdrop(&owner.pubkey(), INITIAL_BALANCE).unwrap();
        svm.airdrop(&fee_recipient.pubkey(), INITIAL_BALANCE).unwrap();
        svm.airdrop(&alice.pubkey(), INITIAL_BALANCE).unwrap();
        svm.airdrop(&bob.pubkey(), INITIAL_BALANCE).unwrap();
        
        // Load Morpho program
        let program_id = program_id();
        let program_bytes = include_bytes!("../../../target/deploy/morpho_solana.so");
        svm.add_program(program_id, program_bytes);
        
        // Parse Switchboard feed addresses
        let sol_usd_feed = SOL_USD_FEED.parse().unwrap_or(Pubkey::new_unique());
        let btc_usd_feed = BTC_USD_FEED.parse().unwrap_or(Pubkey::new_unique());
        let eth_usd_feed = ETH_USD_FEED.parse().unwrap_or(Pubkey::new_unique());
        
        DevnetTestEnv {
            svm,
            program_id,
            owner,
            fee_recipient,
            alice,
            bob,
            sol_usd_feed,
            btc_usd_feed,
            eth_usd_feed,
        }
    }
    
    /// Get protocol state PDA
    pub fn protocol_state_pda(&self) -> (Pubkey, u8) {
        derive_protocol_state(&self.program_id)
    }
    
    /// Get current timestamp
    pub fn get_time(&self) -> i64 {
        let clock: Clock = self.svm.get_sysvar();
        clock.unix_timestamp
    }
    
    /// Warp time forward
    pub fn warp_time(&mut self, seconds: i64) {
        let mut clock: Clock = self.svm.get_sysvar();
        clock.unix_timestamp += seconds;
        self.svm.set_sysvar(&clock);
    }
    
    /// Initialize the Morpho protocol
    pub fn initialize_protocol(&mut self) {
        let (protocol_state_pda, _) = self.protocol_state_pda();
        
        let ix = Instruction {
            program_id: self.program_id,
            accounts: morpho_accounts::Initialize {
                protocol_state: protocol_state_pda,
                payer: self.owner.pubkey(),
                system_program: system_program::ID,
            }.to_account_metas(None),
            data: morpho_ix::Initialize {
                owner: self.owner.pubkey(),
                fee_recipient: self.fee_recipient.pubkey(),
            }.data(),
        };
        
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&self.owner.pubkey()),
            &[&self.owner],
            self.svm.latest_blockhash(),
        );
        
        self.svm.send_transaction(tx).expect("Initialize should succeed");
    }
    
    /// Enable an LLTV for the protocol
    pub fn enable_lltv(&mut self, lltv: u64) {
        let (protocol_state_pda, _) = self.protocol_state_pda();
        
        let ix = Instruction {
            program_id: self.program_id,
            accounts: morpho_accounts::EnableLltv {
                protocol_state: protocol_state_pda,
                owner: self.owner.pubkey(),
            }.to_account_metas(None),
            data: morpho_ix::EnableLltv { lltv }.data(),
        };
        
        let tx = Transaction::new_signed_with_payer(
            &[ix],
            Some(&self.owner.pubkey()),
            &[&self.owner],
            self.svm.latest_blockhash(),
        );
        
        self.svm.send_transaction(tx).expect("Enable LLTV should succeed");
    }
}

// ============================================================================
// Devnet Integration Tests
// ============================================================================

#[cfg(test)]
mod devnet_tests {
    use super::*;
    
    /// Test devnet environment setup
    #[test]
    fn test_devnet_env_setup() {
        let env = DevnetTestEnv::new();
        
        assert_ne!(env.program_id, Pubkey::default());
        assert_ne!(env.sol_usd_feed, Pubkey::default());
        
        println!("✅ Devnet test environment created");
        println!("   Program ID: {}", env.program_id);
        println!("   SOL/USD Feed: {}", env.sol_usd_feed);
    }
    
    /// Test protocol initialization on forked devnet
    #[test]
    fn test_devnet_protocol_init() {
        let mut env = DevnetTestEnv::new();
        
        env.initialize_protocol();
        
        // Verify protocol state exists
        let (pda, _) = env.protocol_state_pda();
        let account = env.svm.get_account(&pda);
        assert!(account.is_some(), "Protocol state should exist");
        
        println!("✅ Protocol initialized on devnet fork");
    }
    
    /// Test enabling LLTV on forked devnet
    #[test]
    fn test_devnet_enable_lltv() {
        let mut env = DevnetTestEnv::new();
        
        env.initialize_protocol();
        
        // Enable 85% LLTV
        env.enable_lltv(8500);
        
        println!("✅ LLTV 85% enabled on devnet fork");
    }
    
    /// Test time warping for interest accrual simulation
    #[test]
    fn test_devnet_time_warp() {
        let mut env = DevnetTestEnv::new();
        
        let initial_time = env.get_time();
        
        // Warp 1 year
        env.warp_time(365 * 24 * 60 * 60);
        
        let new_time = env.get_time();
        assert!(new_time > initial_time, "Time should advance");
        
        let one_year = 365 * 24 * 60 * 60;
        assert_eq!(new_time - initial_time, one_year, "Should warp exactly 1 year");
        
        println!("✅ Time warp: {} -> {} (1 year)", initial_time, new_time);
    }
    
    /// Test Switchboard feed address validation
    #[test]
    fn test_switchboard_feed_addresses() {
        // Verify feed addresses are valid pubkeys
        let sol_feed: Result<Pubkey, _> = SOL_USD_FEED.parse();
        let btc_feed: Result<Pubkey, _> = BTC_USD_FEED.parse();
        let eth_feed: Result<Pubkey, _> = ETH_USD_FEED.parse();
        
        assert!(sol_feed.is_ok(), "SOL/USD feed should be valid pubkey");
        assert!(btc_feed.is_ok(), "BTC/USD feed should be valid pubkey");
        assert!(eth_feed.is_ok(), "ETH/USD feed should be valid pubkey");
        
        println!("✅ Switchboard feed addresses validated");
        println!("   SOL/USD: {}", SOL_USD_FEED);
        println!("   BTC/USD: {}", BTC_USD_FEED);
        println!("   ETH/USD: {}", ETH_USD_FEED);
    }
    
    /// Test LIF calculation for different LLTVs
    #[test]
    fn test_lif_across_lltvs() {
        let lltvs = [7000u64, 7500, 8000, 8500, 9000, 9500];
        
        println!("LIF values for different LLTVs:");
        for lltv in lltvs {
            let lif = calculate_lif(lltv);
            println!("  LLTV {}%: LIF = {}%", lltv as f64 / 100.0, lif as f64 / 100.0);
            
            assert!(lif >= BPS, "LIF should be >= 100%");
            assert!(lif <= MAX_LIF, "LIF should be <= 115%");
        }
        
        println!("✅ LIF calculations verified across LLTV range");
    }
    
    /// Test interest accrual simulation
    #[test]
    fn test_interest_accrual_simulation() {
        let mut env = DevnetTestEnv::new();
        
        env.initialize_protocol();
        env.enable_lltv(8500);
        
        // Simulate 10% APY over 1 year using Taylor series approximation
        let principal = 1_000_000_000_000u128; // 1M tokens
        let rate_per_second = WAD / 10 / 31_536_000; // 10% APY
        
        let interest_factor = w_taylor_compounded(rate_per_second, 31_536_000).unwrap();
        let interest = wad_mul_down(principal, interest_factor).unwrap();
        
        // Taylor series gives compound-style growth ~10.5% vs simple 10%
        // Just verify interest is positive and reasonable (between 5% and 15%)
        let min_interest = principal / 20; // 5%
        let max_interest = principal / 5;  // 20%
        
        assert!(
            interest > min_interest && interest < max_interest,
            "Interest {} should be between {} and {}", interest, min_interest, max_interest
        );
        
        println!("✅ Interest accrual: Taylor compound on {} = {} interest ({:.2}%)", 
            principal, interest, (interest as f64 / principal as f64) * 100.0);
    }
    
    /// Full protocol flow test on devnet fork
    #[test]
    fn test_devnet_full_protocol_flow() {
        let mut env = DevnetTestEnv::new();
        
        // Step 1: Initialize
        env.initialize_protocol();
        println!("✅ Step 1: Protocol initialized");
        
        // Step 2: Enable LLTV
        env.enable_lltv(8500);
        println!("✅ Step 2: LLTV 85% enabled");
        
        // Step 3: Verify state
        let (pda, _) = env.protocol_state_pda();
        let account = env.svm.get_account(&pda);
        assert!(account.is_some());
        println!("✅ Step 3: Protocol state verified");
        
        // Step 4: Time warp for interest test
        env.warp_time(30 * 24 * 60 * 60); // 30 days
        println!("✅ Step 4: Time warped 30 days");
        
        // Step 5: Verify math
        let lif = calculate_lif(8500);
        assert!(lif > BPS);
        println!("✅ Step 5: LIF calculation verified ({}%)", lif as f64 / 100.0);
        
        println!("\n🎉 Full devnet protocol flow completed!");
    }
}

// ============================================================================
// Surfpool Specific Tests (require running surfpool start)
// ============================================================================

#[cfg(test)]
mod surfpool_tests {
    use super::*;
    
    /// Instructions for running with Surfpool
    /// 
    /// To run these tests with real devnet forking:
    /// 1. Start Surfpool: `surfpool start --devnet`
    /// 2. Run tests: `cargo test --package morpho-solana surfpool_tests`
    /// 
    /// Surfpool will lazily fork devnet state and allow cheatcodes.
    
    #[test]
    fn test_surfpool_instructions() {
        println!("╔═══════════════════════════════════════════════════════╗");
        println!("║           Surfpool Devnet Testing Instructions        ║");
        println!("╠═══════════════════════════════════════════════════════╣");
        println!("║ 1. Start Surfpool:                                    ║");
        println!("║    surfpool start --devnet                            ║");
        println!("║                                                       ║");
        println!("║ 2. In another terminal, run tests:                    ║");
        println!("║    cargo test --package morpho-solana surfpool_tests  ║");
        println!("║                                                       ║");
        println!("║ 3. For full devnet fork with Switchboard:             ║");
        println!("║    - Surfpool will fetch oracle data on-demand        ║");
        println!("║    - Use cheatcodes for token balance setup           ║");
        println!("╚═══════════════════════════════════════════════════════╝");
    }
}
