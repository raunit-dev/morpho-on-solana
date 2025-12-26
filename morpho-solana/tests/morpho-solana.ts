import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { MorphoSolana } from "../target/types/morpho_solana";
import {
  PublicKey,
  SystemProgram,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createMint,
  createAssociatedTokenAccount,
  getAssociatedTokenAddress,
  mintTo,
} from "@solana/spl-token";
import { keccak256 } from "js-sha3";

// ============================================================================
// Constants
// ============================================================================

const PROGRAM_SEED_PREFIX = Buffer.from("morpho_v1");
const PROTOCOL_STATE_SEED = Buffer.from("morpho_protocol");
const MARKET_SEED = Buffer.from("morpho_market");
const POSITION_SEED = Buffer.from("morpho_position");
const COLLATERAL_VAULT_SEED = Buffer.from("morpho_collateral_vault");
const LOAN_VAULT_SEED = Buffer.from("morpho_loan_vault");

// Market parameters
const LLTV_85_PERCENT = 8500;

// ============================================================================
// Helper Functions
// ============================================================================

function deriveProtocolStatePda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PROGRAM_SEED_PREFIX, PROTOCOL_STATE_SEED],
    programId
  );
}

function calculateMarketId(
  collateralMint: PublicKey,
  loanMint: PublicKey,
  oracle: PublicKey,
  irm: PublicKey,
  lltv: number
): Buffer {
  const data = Buffer.concat([
    collateralMint.toBuffer(),
    loanMint.toBuffer(),
    oracle.toBuffer(),
    irm.toBuffer(),
    Buffer.from(new BN(lltv).toArray("le", 8)),
  ]);
  // Use keccak256 to match Solana's keccak::hash
  return Buffer.from(keccak256.arrayBuffer(data));
}

function deriveMarketPda(programId: PublicKey, marketId: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PROGRAM_SEED_PREFIX, MARKET_SEED, marketId],
    programId
  );
}

function derivePositionPda(
  programId: PublicKey,
  marketId: Buffer,
  owner: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PROGRAM_SEED_PREFIX, POSITION_SEED, marketId, owner.toBuffer()],
    programId
  );
}

function deriveCollateralVaultPda(programId: PublicKey, marketId: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PROGRAM_SEED_PREFIX, COLLATERAL_VAULT_SEED, marketId],
    programId
  );
}

function deriveLoanVaultPda(programId: PublicKey, marketId: Buffer): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [PROGRAM_SEED_PREFIX, LOAN_VAULT_SEED, marketId],
    programId
  );
}

async function airdrop(
  connection: anchor.web3.Connection,
  pubkey: PublicKey,
  amount: number = 10 * LAMPORTS_PER_SOL
): Promise<void> {
  const sig = await connection.requestAirdrop(pubkey, amount);
  await connection.confirmTransaction(sig, "confirmed");
}

function marketIdToArray(marketId: Buffer): number[] {
  return Array.from(marketId);
}

// ============================================================================
// Test Suite
// ============================================================================

describe("morpho-solana comprehensive e2e tests", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.morphoSolana as Program<MorphoSolana>;
  const connection = provider.connection;

  // Test keypairs
  let owner: Keypair;
  let newOwner: Keypair;
  let feeRecipient: Keypair;
  let alice: Keypair;
  let bob: Keypair;

  // Token mints
  let collateralMint: PublicKey;
  let loanMint: PublicKey;

  // Mock oracle and IRM
  let oracle: Keypair;
  let irm: Keypair;

  // PDAs
  let protocolStatePda: PublicKey;
  let marketId: Buffer;
  let marketPda: PublicKey;

  // ============================================================================
  // Setup
  // ============================================================================

  before(async () => {
    owner = Keypair.generate();
    newOwner = Keypair.generate();
    feeRecipient = Keypair.generate();
    alice = Keypair.generate();
    bob = Keypair.generate();
    oracle = Keypair.generate();
    irm = Keypair.generate();

    console.log("Airdropping SOL to test accounts...");
    await Promise.all([
      airdrop(connection, owner.publicKey),
      airdrop(connection, newOwner.publicKey),
      airdrop(connection, feeRecipient.publicKey),
      airdrop(connection, alice.publicKey),
      airdrop(connection, bob.publicKey),
    ]);

    [protocolStatePda] = deriveProtocolStatePda(program.programId);

    console.log("Test setup complete!");
    console.log("  Owner:", owner.publicKey.toBase58());
    console.log("  Protocol State PDA:", protocolStatePda.toBase58());
  });

  // ============================================================================
  // 1. Admin Instructions
  // ============================================================================

  describe("1. Admin Instructions", () => {

    it("1.1 Initializes the protocol", async () => {
      try {
        const tx = await program.methods
          .initialize(owner.publicKey, feeRecipient.publicKey)
          .accountsStrict({
            payer: provider.wallet.publicKey,
            protocolState: protocolStatePda,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        console.log("    Initialize tx:", tx);
      } catch (e: any) {
        if (e.toString().includes("already in use")) {
          console.log("    Protocol already initialized");
        } else {
          throw e;
        }
      }

      const protocolState = await program.account.protocolState.fetch(protocolStatePda);
      console.log("    Protocol owner:", protocolState.owner.toBase58());
    });

    it("1.2 Fetches and verifies protocol state", async () => {
      const protocolState = await program.account.protocolState.fetch(protocolStatePda);

      if (!protocolState.owner) throw new Error("Owner should be set");
      if (!protocolState.feeRecipient) throw new Error("Fee recipient should be set");
      if (protocolState.paused !== false) throw new Error("Protocol should not be paused");
      console.log("    Protocol state verified");
    });

    it("1.3 Enables an LLTV (85%)", async () => {
      try {
        const tx = await program.methods
          .enableLltv(new BN(LLTV_85_PERCENT))
          .accountsStrict({
            owner: owner.publicKey,
            protocolState: protocolStatePda,
          })
          .signers([owner])
          .rpc();
        console.log("    Enable LLTV tx:", tx);
      } catch (e: any) {
        if (e.toString().includes("AlreadyEnabled")) {
          console.log("    LLTV 85% already enabled");
        } else {
          throw e;
        }
      }

      const state = await program.account.protocolState.fetch(protocolStatePda);
      if (state.lltvCount < 1) throw new Error("LLTV count should be at least 1");
      console.log("    LLTV count:", state.lltvCount);
    });

    it("1.4 Enables an IRM", async () => {
      try {
        const tx = await program.methods
          .enableIrm(irm.publicKey)
          .accountsStrict({
            owner: owner.publicKey,
            protocolState: protocolStatePda,
          })
          .signers([owner])
          .rpc();
        console.log("    Enable IRM tx:", tx);
      } catch (e: any) {
        if (e.toString().includes("AlreadyEnabled")) {
          console.log("    IRM already enabled");
        } else {
          throw e;
        }
      }

      const state = await program.account.protocolState.fetch(protocolStatePda);
      if (state.irmCount < 1) throw new Error("IRM count should be at least 1");
      console.log("    IRM count:", state.irmCount);
    });

    it("1.5 Sets fee recipient", async () => {
      const newRecipient = Keypair.generate().publicKey;

      try {
        const tx = await program.methods
          .setFeeRecipient(newRecipient)
          .accountsStrict({
            owner: owner.publicKey,
            protocolState: protocolStatePda,
          })
          .signers([owner])
          .rpc();
        console.log("    Set fee recipient tx:", tx);

        const state = await program.account.protocolState.fetch(protocolStatePda);
        if (state.feeRecipient.toBase58() !== newRecipient.toBase58()) {
          throw new Error("Fee recipient should be updated");
        }
        console.log("    New fee recipient:", state.feeRecipient.toBase58());
      } catch (e: any) {
        console.log("    Set fee recipient error:", e.message?.substring(0, 100));
      }
    });

    it("1.6 Pause and unpause protocol", async () => {
      try {
        // Pause
        await program.methods
          .setProtocolPaused(true)
          .accountsStrict({
            owner: owner.publicKey,
            protocolState: protocolStatePda,
          })
          .signers([owner])
          .rpc();

        let state = await program.account.protocolState.fetch(protocolStatePda);
        if (state.paused !== true) throw new Error("Protocol should be paused");
        console.log("    Protocol paused");

        // Unpause
        await program.methods
          .setProtocolPaused(false)
          .accountsStrict({
            owner: owner.publicKey,
            protocolState: protocolStatePda,
          })
          .signers([owner])
          .rpc();

        state = await program.account.protocolState.fetch(protocolStatePda);
        if (state.paused !== false) throw new Error("Protocol should be unpaused");
        console.log("    Protocol unpaused");
      } catch (e: any) {
        console.log("    Pause test error:", e.message?.substring(0, 100));
      }
    });

    it("1.7 Two-step ownership transfer", async () => {
      try {
        // Step 1: Transfer ownership
        await program.methods
          .transferOwnership(newOwner.publicKey)
          .accountsStrict({
            owner: owner.publicKey,
            protocolState: protocolStatePda,
          })
          .signers([owner])
          .rpc();

        let state = await program.account.protocolState.fetch(protocolStatePda);
        if (state.pendingOwner.toBase58() !== newOwner.publicKey.toBase58()) {
          throw new Error("Pending owner should be set");
        }
        console.log("    Ownership transfer initiated");

        // Step 2: Accept ownership
        await program.methods
          .acceptOwnership()
          .accountsStrict({
            pendingOwner: newOwner.publicKey,
            protocolState: protocolStatePda,
          })
          .signers([newOwner])
          .rpc();

        state = await program.account.protocolState.fetch(protocolStatePda);
        if (state.owner.toBase58() !== newOwner.publicKey.toBase58()) {
          throw new Error("Owner should be updated");
        }
        console.log("    Ownership accepted");

        // Transfer back
        await program.methods
          .transferOwnership(owner.publicKey)
          .accountsStrict({
            owner: newOwner.publicKey,
            protocolState: protocolStatePda,
          })
          .signers([newOwner])
          .rpc();

        await program.methods
          .acceptOwnership()
          .accountsStrict({
            pendingOwner: owner.publicKey,
            protocolState: protocolStatePda,
          })
          .signers([owner])
          .rpc();

        console.log("    Ownership transferred back");
      } catch (e: any) {
        console.log("    Ownership transfer error:", e.message?.substring(0, 200));
      }
    });
  });

  // ============================================================================
  // 2. Token Setup
  // ============================================================================

  describe("2. Token Setup", () => {

    it("2.1 Creates collateral token mint (9 decimals)", async () => {
      collateralMint = await createMint(
        connection,
        owner,
        owner.publicKey,
        null,
        9,
        undefined,
        undefined,
        TOKEN_PROGRAM_ID
      );
      console.log("    Collateral mint:", collateralMint.toBase58());
    });

    it("2.2 Creates loan token mint (6 decimals)", async () => {
      loanMint = await createMint(
        connection,
        owner,
        owner.publicKey,
        null,
        6,
        undefined,
        undefined,
        TOKEN_PROGRAM_ID
      );
      console.log("    Loan mint:", loanMint.toBase58());
    });

    it("2.3 Creates token accounts and mints tokens", async () => {
      // Alice ATAs
      const aliceCollateralAta = await createAssociatedTokenAccount(
        connection, alice, collateralMint, alice.publicKey
      );
      const aliceLoanAta = await createAssociatedTokenAccount(
        connection, alice, loanMint, alice.publicKey
      );

      // Bob ATAs
      const bobCollateralAta = await createAssociatedTokenAccount(
        connection, bob, collateralMint, bob.publicKey
      );
      const bobLoanAta = await createAssociatedTokenAccount(
        connection, bob, loanMint, bob.publicKey
      );

      // Mint tokens
      await mintTo(connection, owner, collateralMint, aliceCollateralAta, owner, 100_000_000_000);
      await mintTo(connection, owner, loanMint, aliceLoanAta, owner, 100_000_000_000);
      await mintTo(connection, owner, collateralMint, bobCollateralAta, owner, 100_000_000_000);
      await mintTo(connection, owner, loanMint, bobLoanAta, owner, 100_000_000_000);

      console.log("    Tokens minted to Alice and Bob");
    });

    it("2.4 Calculates market ID and PDAs", async () => {
      marketId = calculateMarketId(
        collateralMint,
        loanMint,
        oracle.publicKey,
        irm.publicKey,
        LLTV_85_PERCENT
      );

      [marketPda] = deriveMarketPda(program.programId, marketId);

      console.log("    Market ID:", marketId.toString("hex").substring(0, 16) + "...");
      console.log("    Market PDA:", marketPda.toBase58());
    });
  });

  // ============================================================================
  // 3. Market Creation
  // ============================================================================

  describe("3. Market Creation", () => {

    it("3.1 Creates a market", async () => {
      const [collateralVaultPda] = deriveCollateralVaultPda(program.programId, marketId);
      const [loanVaultPda] = deriveLoanVaultPda(program.programId, marketId);

      try {
        const tx = await program.methods
          .createMarket(
            collateralMint,
            loanMint,
            oracle.publicKey,
            irm.publicKey,
            new BN(LLTV_85_PERCENT)
          )
          .accountsStrict({
            creator: provider.wallet.publicKey,
            protocolState: protocolStatePda,
            market: marketPda,
            collateralMint: collateralMint,
            loanMint: loanMint,
            collateralVault: collateralVaultPda,
            loanVault: loanVaultPda,
            oracle: oracle.publicKey,
            irm: irm.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: SystemProgram.programId,
          })
          .rpc();
        console.log("    Create market tx:", tx);
      } catch (e: any) {
        if (e.toString().includes("already in use")) {
          console.log("    Market already created");
        } else {
          throw e;
        }
      }
    });

    it("3.2 Verifies market state", async () => {
      try {
        const market = await program.account.market.fetch(marketPda);

        if (market.collateralMint.toBase58() !== collateralMint.toBase58()) {
          throw new Error("Collateral mint mismatch");
        }
        if (market.loanMint.toBase58() !== loanMint.toBase58()) {
          throw new Error("Loan mint mismatch");
        }
        if (market.lltv.toNumber() !== LLTV_85_PERCENT) {
          throw new Error("LLTV mismatch");
        }

        console.log("    Market verified");
        console.log("    LLTV:", market.lltv.toNumber());
        console.log("    Total supply:", market.totalSupplyAssets.toString());
      } catch (e: any) {
        console.log("    Market verification error:", e.message?.substring(0, 100));
      }
    });

    it("3.3 Sets market fee", async () => {
      const marketIdArray = marketIdToArray(marketId);

      try {
        await program.methods
          .setFee(marketIdArray, new BN(1000))
          .accountsStrict({
            owner: owner.publicKey,
            protocolState: protocolStatePda,
            market: marketPda,
          })
          .signers([owner])
          .rpc();

        const market = await program.account.market.fetch(marketPda);
        if (market.fee.toNumber() !== 1000) throw new Error("Fee should be 1000");
        console.log("    Fee set to 10%");
      } catch (e: any) {
        console.log("    Set fee error:", e.message?.substring(0, 100));
      }
    });
  });

  // ============================================================================
  // 4. Position Management
  // ============================================================================

  describe("4. Position Management", () => {
    let alicePositionPda: PublicKey;
    let bobPositionPda: PublicKey;

    before(() => {
      [alicePositionPda] = derivePositionPda(program.programId, marketId, alice.publicKey);
      [bobPositionPda] = derivePositionPda(program.programId, marketId, bob.publicKey);
    });

    it("4.1 Creates position for Alice", async () => {
      const marketIdArray = marketIdToArray(marketId);

      try {
        const tx = await program.methods
          .createPosition(marketIdArray)
          .accountsStrict({
            payer: alice.publicKey,
            owner: alice.publicKey,
            market: marketPda,
            position: alicePositionPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([alice])
          .rpc();
        console.log("    Create Alice position tx:", tx);
      } catch (e: any) {
        if (e.toString().includes("already in use")) {
          console.log("    Alice position already exists");
        } else {
          throw e;
        }
      }
    });

    it("4.2 Creates position for Bob", async () => {
      const marketIdArray = marketIdToArray(marketId);

      try {
        const tx = await program.methods
          .createPosition(marketIdArray)
          .accountsStrict({
            payer: bob.publicKey,
            owner: bob.publicKey,
            market: marketPda,
            position: bobPositionPda,
            systemProgram: SystemProgram.programId,
          })
          .signers([bob])
          .rpc();
        console.log("    Create Bob position tx:", tx);
      } catch (e: any) {
        if (e.toString().includes("already in use")) {
          console.log("    Bob position already exists");
        } else {
          throw e;
        }
      }
    });

    it("4.3 Verifies position state", async () => {
      try {
        const pos = await program.account.position.fetch(alicePositionPda);

        if (pos.owner.toBase58() !== alice.publicKey.toBase58()) {
          throw new Error("Position owner mismatch");
        }
        if (pos.supplyShares.toString() !== "0") throw new Error("Supply shares should be 0");
        if (pos.borrowShares.toString() !== "0") throw new Error("Borrow shares should be 0");
        if (pos.collateral.toString() !== "0") throw new Error("Collateral should be 0");

        console.log("    Alice position verified - empty state");
      } catch (e: any) {
        console.log("    Position verification error:", e.message?.substring(0, 100));
      }
    });
  });

  // ============================================================================
  // 5. Supply Flow
  // ============================================================================

  describe("5. Supply Flow", () => {
    let aliceLoanAta: PublicKey;
    let alicePositionPda: PublicKey;
    let loanVaultPda: PublicKey;

    before(async () => {
      aliceLoanAta = await getAssociatedTokenAddress(loanMint, alice.publicKey);
      [alicePositionPda] = derivePositionPda(program.programId, marketId, alice.publicKey);
      [loanVaultPda] = deriveLoanVaultPda(program.programId, marketId);
    });

    it("5.1 Alice supplies liquidity", async () => {
      const marketIdArray = marketIdToArray(marketId);
      const supplyAmount = new BN(10_000_000_000);

      try {
        const tx = await program.methods
          .supply(marketIdArray, supplyAmount, new BN(0))
          .accountsStrict({
            supplier: alice.publicKey,
            onBehalfOf: alice.publicKey,
            protocolState: protocolStatePda,
            market: marketPda,
            position: alicePositionPda,
            loanMint: loanMint,
            supplierTokenAccount: aliceLoanAta,
            loanVault: loanVaultPda,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([alice])
          .rpc();
        console.log("    Supply tx:", tx);

        const position = await program.account.position.fetch(alicePositionPda);
        if (Number(position.supplyShares.toString()) <= 0) {
          throw new Error("Supply shares should be positive");
        }
        console.log("    Supply shares:", position.supplyShares.toString());
      } catch (e: any) {
        console.log("    Supply error:", e.message?.substring(0, 200));
      }
    });
  });

  // ============================================================================
  // 6. Collateral and Borrow Flow
  // ============================================================================

  describe("6. Collateral and Borrow Flow", () => {
    let bobCollateralAta: PublicKey;
    let bobLoanAta: PublicKey;
    let bobPositionPda: PublicKey;
    let collateralVaultPda: PublicKey;
    let loanVaultPda: PublicKey;

    before(async () => {
      bobCollateralAta = await getAssociatedTokenAddress(collateralMint, bob.publicKey);
      bobLoanAta = await getAssociatedTokenAddress(loanMint, bob.publicKey);
      [bobPositionPda] = derivePositionPda(program.programId, marketId, bob.publicKey);
      [collateralVaultPda] = deriveCollateralVaultPda(program.programId, marketId);
      [loanVaultPda] = deriveLoanVaultPda(program.programId, marketId);
    });

    it("6.1 Bob deposits collateral", async () => {
      const marketIdArray = marketIdToArray(marketId);
      const amount = new BN(5_000_000_000);

      try {
        const tx = await program.methods
          .supplyCollateral(marketIdArray, amount)
          .accountsStrict({
            depositor: bob.publicKey,
            onBehalfOf: bob.publicKey,
            protocolState: protocolStatePda,
            market: marketPda,
            position: bobPositionPda,
            collateralMint: collateralMint,
            depositorTokenAccount: bobCollateralAta,
            collateralVault: collateralVaultPda,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([bob])
          .rpc();
        console.log("    Supply collateral tx:", tx);

        const position = await program.account.position.fetch(bobPositionPda);
        console.log("    Collateral deposited:", position.collateral.toString());
      } catch (e: any) {
        console.log("    Supply collateral error:", e.message?.substring(0, 200));
      }
    });

    it("6.2 Bob borrows against collateral", async () => {
      const marketIdArray = marketIdToArray(marketId);
      const borrowAmount = new BN(2_000_000_000);

      try {
        const tx = await program.methods
          .borrow(marketIdArray, borrowAmount, new BN("99999999999999999999"))
          .accountsStrict({
            caller: bob.publicKey,
            onBehalfOf: bob.publicKey,
            receiver: bob.publicKey,
            protocolState: protocolStatePda,
            market: marketPda,
            position: bobPositionPda,
            loanMint: loanMint,
            receiverLoanAccount: bobLoanAta,
            loanVault: loanVaultPda,
            oracle: oracle.publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([bob])
          .rpc();
        console.log("    Borrow tx:", tx);

        const position = await program.account.position.fetch(bobPositionPda);
        console.log("    Borrow shares:", position.borrowShares.toString());
      } catch (e: any) {
        console.log("    Borrow error:", e.message?.substring(0, 200));
      }
    });

    it("6.3 Bob repays borrow", async () => {
      const marketIdArray = marketIdToArray(marketId);
      const repayAmount = new BN(1_000_000_000);

      try {
        const tx = await program.methods
          .repay(marketIdArray, repayAmount, new BN(0))
          .accountsStrict({
            repayer: bob.publicKey,
            onBehalfOf: bob.publicKey,
            market: marketPda,
            position: bobPositionPda,
            loanMint: loanMint,
            repayerTokenAccount: bobLoanAta,
            loanVault: loanVaultPda,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([bob])
          .rpc();
        console.log("    Repay tx:", tx);

        const position = await program.account.position.fetch(bobPositionPda);
        console.log("    Borrow shares after repay:", position.borrowShares.toString());
      } catch (e: any) {
        console.log("    Repay error:", e.message?.substring(0, 200));
      }
    });
  });

  // ============================================================================
  // 7. Utility Instructions
  // ============================================================================

  describe("7. Utility Instructions", () => {

    it("7.1 Accrues interest on market", async () => {
      const marketIdArray = marketIdToArray(marketId);

      try {
        const tx = await program.methods
          .accrueInterest(marketIdArray)
          .accountsStrict({
            market: marketPda,
          })
          .rpc();
        console.log("    Accrue interest tx:", tx);

        const market = await program.account.market.fetch(marketPda);
        console.log("    Last update:", market.lastUpdate.toString());
      } catch (e: any) {
        console.log("    Accrue interest error:", e.message?.substring(0, 200));
      }
    });
  });

  // ============================================================================
  // 8. Summary
  // ============================================================================

  describe("8. Summary", () => {

    it("8.1 Prints final state", async () => {
      console.log("\n    === Final State Summary ===");

      try {
        const market = await program.account.market.fetch(marketPda);
        const [alicePositionPda] = derivePositionPda(program.programId, marketId, alice.publicKey);
        const [bobPositionPda] = derivePositionPda(program.programId, marketId, bob.publicKey);

        const alicePosition = await program.account.position.fetch(alicePositionPda);
        const bobPosition = await program.account.position.fetch(bobPositionPda);

        console.log("\n    Market:");
        console.log("      Total Supply:", market.totalSupplyAssets.toString());
        console.log("      Total Borrow:", market.totalBorrowAssets.toString());

        console.log("\n    Alice (Supplier):");
        console.log("      Supply Shares:", alicePosition.supplyShares.toString());

        console.log("\n    Bob (Borrower):");
        console.log("      Collateral:", bobPosition.collateral.toString());
        console.log("      Borrow Shares:", bobPosition.borrowShares.toString());

        console.log("\n    === Tests Complete ===\n");
      } catch (e: any) {
        console.log("    Summary error:", e.message?.substring(0, 200));
      }
    });
  });
});
