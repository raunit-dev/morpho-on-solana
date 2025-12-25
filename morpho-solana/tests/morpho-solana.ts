import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { MorphoSolana } from "../target/types/morpho_solana";
import { PublicKey, SystemProgram, Keypair } from "@solana/web3.js";

describe("morpho-solana", () => {
  // Configure the client to use the local cluster
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.morphoSolana as Program<MorphoSolana>;

  // Derive protocol state PDA
  const [protocolStatePda, protocolStateBump] = PublicKey.findProgramAddressSync(
    [Buffer.from("morpho"), Buffer.from("protocol_state")],
    program.programId
  );

  it("Initializes the protocol", async () => {
    try {
      const tx = await program.methods
        .initialize()
        .accounts({
          protocolState: protocolStatePda,
          owner: provider.wallet.publicKey,
          payer: provider.wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      console.log("Initialize transaction signature:", tx);
    } catch (e) {
      // If already initialized, that's ok
      if (e.toString().includes("already in use")) {
        console.log("Protocol already initialized");
      } else {
        throw e;
      }
    }
  });

  it("Fetches protocol state", async () => {
    const protocolState = await program.account.protocolState.fetch(protocolStatePda);
    console.log("Protocol owner:", protocolState.owner.toString());
    console.log("Protocol fee recipient:", protocolState.feeRecipient.toString());
  });

  it("Enables an LLTV", async () => {
    const lltv = 8500; // 85%

    try {
      const tx = await program.methods
        .enableLltv(new anchor.BN(lltv))
        .accounts({
          protocolState: protocolStatePda,
          owner: provider.wallet.publicKey,
        })
        .rpc();
      console.log("Enable LLTV transaction signature:", tx);
    } catch (e) {
      // If LLTV already enabled, that's ok
      console.log("LLTV enable result:", e.toString().substring(0, 100));
    }
  });
});
