import { Program, AnchorProvider, Idl, BN } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorWallet } from '@solana/wallet-adapter-react';
import { keccak256 } from 'js-sha3';
import IDL from './idl.json';

// Program ID from deployed contract
export const MORPHO_PROGRAM_ID = new PublicKey(
    '9qYe29CskmZ1mcuLLFcQXovfbqXBqLsXpg4y7Rfk9NsE'
);

// Seed constants
export const PROGRAM_SEED = Buffer.from('morpho');

export function getMorphoProgram(
    connection: Connection,
    wallet: AnchorWallet
): Program {
    const provider = new AnchorProvider(connection, wallet, {
        commitment: 'confirmed',
    });

    return new Program(IDL as Idl, provider);
}

// PDA Derivation Helpers
export function getProtocolStatePDA(): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [PROGRAM_SEED, Buffer.from('protocol_state')],
        MORPHO_PROGRAM_ID
    );
}

export function getMarketPDA(marketId: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [PROGRAM_SEED, Buffer.from('market'), marketId],
        MORPHO_PROGRAM_ID
    );
}

export function getPositionPDA(
    marketId: Buffer,
    owner: PublicKey
): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [PROGRAM_SEED, Buffer.from('position'), marketId, owner.toBuffer()],
        MORPHO_PROGRAM_ID
    );
}

export function getLoanVaultPDA(marketId: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [PROGRAM_SEED, Buffer.from('loan_vault'), marketId],
        MORPHO_PROGRAM_ID
    );
}

export function getCollateralVaultPDA(marketId: Buffer): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [PROGRAM_SEED, Buffer.from('collateral_vault'), marketId],
        MORPHO_PROGRAM_ID
    );
}

export function getAuthorizationPDA(
    authorizer: PublicKey,
    authorized: PublicKey
): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
        [
            PROGRAM_SEED,
            Buffer.from('authorization'),
            authorizer.toBuffer(),
            authorized.toBuffer(),
        ],
        MORPHO_PROGRAM_ID
    );
}

// Market ID calculation (keccak256 hash)
export function calculateMarketId(
    collateralMint: PublicKey,
    loanMint: PublicKey,
    oracle: PublicKey,
    irm: PublicKey,
    lltv: number
): Buffer {
    const lltvBuffer = Buffer.alloc(8);
    lltvBuffer.writeBigUInt64LE(BigInt(lltv));

    const data = Buffer.concat([
        collateralMint.toBuffer(),
        loanMint.toBuffer(),
        oracle.toBuffer(),
        irm.toBuffer(),
        lltvBuffer,
    ]);

    return Buffer.from(keccak256(data), 'hex');
}

// Utility to convert market ID to array for instruction
export function marketIdToArray(marketId: Buffer): number[] {
    return Array.from(marketId);
}
