import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { MorphoSolana } from "../target/types/morpho_solana";

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);

const program = anchor.workspace.morphoSolana as anchor.Program<MorphoSolana>;
const [protocolStatePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("morpho_v1"), Buffer.from("morpho_protocol")],
    program.programId
);

async function main() {
    console.log("Checking protocol state on devnet...\n");
    console.log("Provider wallet:", provider.wallet.publicKey.toBase58());
    console.log("Protocol State PDA:", protocolStatePda.toBase58());

    try {
        const state = await program.account.protocolState.fetch(protocolStatePda);
        console.log("\n=== Protocol State ===");
        console.log("Owner:", state.owner.toBase58());
        console.log("Fee Recipient:", state.feeRecipient.toBase58());
        console.log("LLTV Count:", state.lltvCount);
        console.log("IRM Count:", state.irmCount);
        console.log("Paused:", state.paused);

        console.log("\n=== Ownership Match ===");
        if (state.owner.toBase58() === provider.wallet.publicKey.toBase58()) {
            console.log("✅ Provider wallet IS the protocol owner");
        } else {
            console.log("❌ Provider wallet is NOT the owner");
            console.log("   Need to transfer ownership or use owner's keypair");
        }
    } catch (e: any) {
        console.log("Error:", e.message);
    }
}

main().catch(console.error);
