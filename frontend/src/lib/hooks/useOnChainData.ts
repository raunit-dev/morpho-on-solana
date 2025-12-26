'use client';

import { useQuery } from '@tanstack/react-query';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { Program, AnchorProvider, Idl, BN } from '@coral-xyz/anchor';
import { PublicKey, Connection } from '@solana/web3.js';
import IDL from '../anchor/idl.json';
import { MORPHO_PROGRAM_ID, getProtocolStatePDA } from '../anchor/client';

// Types from on-chain program
export interface OnChainMarket {
    publicKey: PublicKey;
    account: {
        id: number[];
        loanMint: PublicKey;
        collateralMint: PublicKey;
        oracle: PublicKey;
        irm: PublicKey;
        lltv: number;
        fee: number;
        totalSupplyAssets: bigint;
        totalSupplyShares: bigint;
        totalBorrowAssets: bigint;
        totalBorrowShares: bigint;
        lastUpdate: bigint;
        paused: boolean;
    };
}

export interface OnChainPosition {
    publicKey: PublicKey;
    account: {
        owner: PublicKey;
        marketId: number[];
        supplyShares: bigint;
        borrowShares: bigint;
        collateral: bigint;
    };
}

export interface OnChainProtocolState {
    owner: PublicKey;
    pendingOwner: PublicKey | null;
    feeRecipient: PublicKey;
    paused: boolean;
}

// Helper to create program instance
function createProgram(connection: Connection): Program | null {
    try {
        // Create a dummy wallet for read-only operations
        const dummyWallet = {
            publicKey: PublicKey.default,
            signTransaction: async () => { throw new Error('Read-only'); },
            signAllTransactions: async () => { throw new Error('Read-only'); },
        };

        const provider = new AnchorProvider(connection, dummyWallet as never, {
            commitment: 'confirmed',
        });

        return new Program(IDL as Idl, provider);
    } catch (error) {
        console.error('Failed to create program:', error);
        return null;
    }
}

// Hook to fetch protocol state
export function useProtocolState() {
    const { connection } = useConnection();

    return useQuery({
        queryKey: ['protocolState', connection.rpcEndpoint],
        queryFn: async () => {
            const program = createProgram(connection);
            if (!program) return null;

            const [protocolStatePDA] = getProtocolStatePDA();

            try {
                // Try to fetch using the account name from IDL
                const accounts = program.account as Record<string, { fetch: (key: PublicKey) => Promise<unknown> }>;

                // The IDL has "ProtocolState" but Anchor converts to camelCase
                const accountName = Object.keys(accounts).find(
                    k => k.toLowerCase() === 'protocolstate'
                );

                if (!accountName) {
                    console.log('ProtocolState account not found in IDL');
                    return null;
                }

                const state = await accounts[accountName].fetch(protocolStatePDA);
                return state as OnChainProtocolState;
            } catch (error) {
                console.log('Protocol not initialized:', error);
                return null;
            }
        },
        staleTime: 30_000,
        refetchInterval: 60_000,
    });
}

// Hook to fetch all markets
export function useMarkets() {
    const { connection } = useConnection();

    return useQuery({
        queryKey: ['markets', connection.rpcEndpoint],
        queryFn: async () => {
            const program = createProgram(connection);
            if (!program) return [];

            try {
                const accounts = program.account as Record<string, { all: () => Promise<unknown[]> }>;

                // Find the market account accessor
                const accountName = Object.keys(accounts).find(
                    k => k.toLowerCase() === 'market'
                );

                if (!accountName) {
                    console.log('Market account not found in IDL');
                    return [];
                }

                const markets = await accounts[accountName].all();
                return markets as OnChainMarket[];
            } catch (error) {
                console.log('No markets found:', error);
                return [];
            }
        },
        staleTime: 30_000,
        refetchInterval: 60_000,
    });
}

// Hook to fetch a single market by ID
export function useMarket(marketId: string) {
    const { data: markets, isLoading, error } = useMarkets();

    const market = markets?.find((m) => {
        // Convert market ID array to hex string for comparison
        const idHex = Buffer.from(m.account.id).toString('hex');
        return idHex === marketId || m.publicKey.toString() === marketId;
    });

    return { data: market, isLoading, error };
}

// Hook to fetch user positions
export function useUserPositions() {
    const { connection } = useConnection();
    const { publicKey } = useWallet();

    return useQuery({
        queryKey: ['positions', publicKey?.toString(), connection.rpcEndpoint],
        queryFn: async () => {
            if (!publicKey) return [];

            const program = createProgram(connection);
            if (!program) return [];

            try {
                const accounts = program.account as Record<string, {
                    all: (filters?: { memcmp: { offset: number; bytes: string } }[]) => Promise<unknown[]>
                }>;

                // Find the position account accessor
                const accountName = Object.keys(accounts).find(
                    k => k.toLowerCase() === 'position'
                );

                if (!accountName) {
                    console.log('Position account not found in IDL');
                    return [];
                }

                const positions = await accounts[accountName].all([
                    {
                        memcmp: {
                            offset: 8, // Skip discriminator
                            bytes: publicKey.toBase58(),
                        },
                    },
                ]);
                return positions as OnChainPosition[];
            } catch (error) {
                console.log('No positions found:', error);
                return [];
            }
        },
        enabled: !!publicKey,
        staleTime: 10_000,
        refetchInterval: 30_000,
    });
}

// Hook to fetch a specific position
export function usePosition(marketId: string) {
    const { data: positions, isLoading, error } = useUserPositions();

    const position = positions?.find((p) => {
        const idHex = Buffer.from(p.account.marketId).toString('hex');
        return idHex === marketId;
    });

    return { data: position, isLoading, error };
}

// Hook to check if current wallet is admin
export function useIsAdmin() {
    const { publicKey } = useWallet();
    const { data: protocolState, isLoading } = useProtocolState();

    if (isLoading) return undefined;
    if (!publicKey || !protocolState) return false;

    return publicKey.equals(protocolState.owner);
}

// Hook to fetch positions with active borrows (potential liquidation targets)
export function useLiquidatablePositions() {
    const { connection } = useConnection();
    const { data: markets } = useMarkets();

    return useQuery({
        queryKey: ['liquidatable', markets?.length, connection.rpcEndpoint],
        queryFn: async () => {
            if (!markets) return [];

            const program = createProgram(connection);
            if (!program) return [];

            try {
                const accounts = program.account as Record<string, { all: () => Promise<unknown[]> }>;

                const accountName = Object.keys(accounts).find(
                    k => k.toLowerCase() === 'position'
                );

                if (!accountName) return [];

                // Fetch all positions
                const allPositions = await accounts[accountName].all() as OnChainPosition[];

                // Filter for positions with active borrows
                const withBorrows = allPositions.filter((p) => {
                    return Number(p.account.borrowShares) > 0;
                });

                return withBorrows;
            } catch (error) {
                console.log('Error fetching positions:', error);
                return [];
            }
        },
        enabled: !!markets,
        staleTime: 15_000,
        refetchInterval: 30_000,
    });
}
