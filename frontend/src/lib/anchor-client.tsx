"use client";

import { Program, AnchorProvider, Idl } from "@coral-xyz/anchor";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMemo } from "react";
import { PublicKey } from "@solana/web3.js";
import idl from "./idl/morpho_solana.json";

// Program ID from deployment
export const MORPHO_PROGRAM_ID = new PublicKey(
    "9qYe29CskmZ1mcuLLFcQXovfbqXBqLsXpg4y7Rfk9NsE"
);

// Protocol state PDA
export const PROTOCOL_SEED_PREFIX = Buffer.from("morpho");
export const PROTOCOL_STATE_SEED = Buffer.from("protocol_state");

export function deriveProtocolState(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [PROTOCOL_SEED_PREFIX, PROTOCOL_STATE_SEED],
        MORPHO_PROGRAM_ID
    );
}

export function deriveMarket(marketId: Uint8Array): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [PROTOCOL_SEED_PREFIX, Buffer.from("market"), marketId],
        MORPHO_PROGRAM_ID
    );
}

export function derivePosition(
    marketId: Uint8Array,
    owner: PublicKey
): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [PROTOCOL_SEED_PREFIX, Buffer.from("position"), marketId, owner.toBuffer()],
        MORPHO_PROGRAM_ID
    );
}

export function useMorphoProgram() {
    const { connection } = useConnection();
    const wallet = useWallet();

    const provider = useMemo(() => {
        if (!wallet.publicKey) return null;
        return new AnchorProvider(
            connection,
            wallet as never,
            AnchorProvider.defaultOptions()
        );
    }, [connection, wallet]);

    const program = useMemo(() => {
        if (!provider) return null;
        return new Program(idl as Idl, provider);
    }, [provider]);

    return { program, provider, connection, wallet };
}
