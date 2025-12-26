'use client';

import { useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { PublicKey, SystemProgram } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';
import {
    TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import {
    getMorphoProgram,
    getProtocolStatePDA,
    getMarketPDA,
    getPositionPDA,
    getCollateralVaultPDA,
    getLoanVaultPDA,
} from '../anchor/client';
import { toast } from 'sonner';
import { useDebug } from '../debug/DebugContext';

export function useMorphoActions() {
    const { connection } = useConnection();
    const wallet = useWallet();
    const { addLog, updateLog } = useDebug();

    const getProgram = useCallback(() => {
        if (!wallet || !wallet.publicKey || !wallet.signTransaction || !wallet.signAllTransactions) {
            return null;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return getMorphoProgram(connection, wallet as any);
    }, [connection, wallet]);

    // Ensure ATA helper
    const ensureATA = useCallback(async (owner: PublicKey, mint: PublicKey) => {
        const ata = await getAssociatedTokenAddress(mint, owner);
        const info = await connection.getAccountInfo(ata);
        let ix = null;
        if (!info) {
            ix = createAssociatedTokenAccountInstruction(
                wallet.publicKey!, // payer
                ata,
                owner,
                mint
            );
        }
        return { ata, ix };
    }, [connection, wallet.publicKey]);

    // Admin: Initialize Protocol
    const initializeProtocol = useCallback(async (feeRecipient: PublicKey) => {
        const program = getProgram();
        if (!program || !wallet.publicKey) throw new Error('Wallet not connected');

        const [protocolStatePDA] = getProtocolStatePDA();
        const startTime = Date.now();

        const logId = addLog({
            instruction: 'initialize',
            status: 'pending',
            params: { owner: wallet.publicKey.toString(), feeRecipient: feeRecipient.toString() },
            accounts: {
                payer: wallet.publicKey.toString(),
                protocolState: protocolStatePDA.toString(),
                systemProgram: SystemProgram.programId.toString(),
            },
        });

        try {
            const tx = await program.methods
                .initialize(wallet.publicKey, feeRecipient)
                .accounts({
                    payer: wallet.publicKey,
                })
                .rpc();

            updateLog(logId, {
                status: 'success',
                signature: tx,
                duration: Date.now() - startTime
            });
            toast.success('Protocol initialized successfully');
            return tx;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            updateLog(logId, {
                status: 'error',
                error: errorMsg,
                duration: Date.now() - startTime
            });
            console.error('Initialize error:', error);
            toast.error('Failed to initialize protocol');
            throw error;
        }
    }, [getProgram, wallet.publicKey, addLog, updateLog]);

    // Admin: Create Market
    const createMarket = useCallback(async (
        collateralMint: PublicKey,
        loanMint: PublicKey,
        oracle: PublicKey,
        irm: PublicKey,
        lltv: bigint
    ) => {
        const program = getProgram();
        if (!program || !wallet.publicKey) throw new Error('Wallet not connected');

        const [protocolStatePDA] = getProtocolStatePDA();
        const startTime = Date.now();

        const logId = addLog({
            instruction: 'create_market',
            status: 'pending',
            params: {
                collateralMint: collateralMint.toString(),
                loanMint: loanMint.toString(),
                oracle: oracle.toString(),
                irm: irm.toString(),
                lltv: lltv.toString(),
            },
            accounts: {
                creator: wallet.publicKey.toString(),
                protocolState: protocolStatePDA.toString(),
            },
        });

        try {
            const tx = await program.methods
                .createMarket(
                    collateralMint,
                    loanMint,
                    oracle,
                    irm,
                    new BN(lltv.toString())
                )
                .accounts({
                    creator: wallet.publicKey,
                    protocolState: protocolStatePDA,
                    collateralMint,
                    loanMint,
                    oracle,
                    irm,
                    tokenProgram: TOKEN_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            updateLog(logId, {
                status: 'success',
                signature: tx,
                duration: Date.now() - startTime
            });
            toast.success('Market created successfully');
            return tx;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            updateLog(logId, {
                status: 'error',
                error: errorMsg,
                duration: Date.now() - startTime
            });
            console.error('Create Market error:', error);
            toast.error('Failed to create market');
            throw error;
        }
    }, [getProgram, wallet.publicKey, addLog, updateLog]);

    // Supply Loan Assets
    const supply = useCallback(async (
        marketId: Buffer,
        amount: bigint,
        loanMint: PublicKey
    ) => {
        const program = getProgram();
        if (!program || !wallet.publicKey) throw new Error('Wallet not connected');
        if (!loanMint) throw new Error('Loan mint required');

        const marketIdArray = Array.from(marketId);
        const [marketPDA] = getMarketPDA(marketId);
        const [positionPDA] = getPositionPDA(marketId, wallet.publicKey);
        const [loanVaultPDA] = getLoanVaultPDA(marketId);
        const startTime = Date.now();

        const logId = addLog({
            instruction: 'supply',
            status: 'pending',
            params: {
                marketId: marketId.toString('hex'),
                amount: amount.toString(),
                loanMint: loanMint.toString(),
            },
            accounts: {
                owner: wallet.publicKey.toString(),
                market: marketPDA.toString(),
                position: positionPDA.toString(),
                loanVault: loanVaultPDA.toString(),
            },
        });

        const { ata: userTokenAccount, ix: createAtaIx } = await ensureATA(wallet.publicKey, loanMint);

        try {
            const preInstructions = createAtaIx ? [createAtaIx] : [];

            const posInfo = await connection.getAccountInfo(positionPDA);
            if (!posInfo) {
                const createPosIx = await program.methods
                    .createPosition(marketIdArray)
                    .accounts({
                        payer: wallet.publicKey,
                        position: positionPDA,
                        market: marketPDA,
                        owner: wallet.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .instruction();
                preInstructions.push(createPosIx);
            }

            const tx = await program.methods
                .supply(marketIdArray, new BN(amount.toString()), new BN(0))
                .accounts({
                    owner: wallet.publicKey,
                    market: marketPDA,
                    position: positionPDA,
                    senderTokenAccount: userTokenAccount,
                    loanVault: loanVaultPDA,
                    loanMint: loanMint,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .preInstructions(preInstructions)
                .rpc();

            updateLog(logId, {
                status: 'success',
                signature: tx,
                duration: Date.now() - startTime
            });
            toast.success(`Supplied ${amount} assets successfully`);
            return tx;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            updateLog(logId, {
                status: 'error',
                error: errorMsg,
                duration: Date.now() - startTime
            });
            console.error('Supply error:', error);
            toast.error('Failed to supply assets');
            throw error;
        }
    }, [getProgram, connection, wallet.publicKey, ensureATA, addLog, updateLog]);

    // Supply Collateral
    const supplyCollateral = useCallback(async (
        marketId: Buffer,
        amount: bigint,
        collateralMint: PublicKey
    ) => {
        const program = getProgram();
        if (!program || !wallet.publicKey) throw new Error('Wallet not connected');

        const marketIdArray = Array.from(marketId);
        const [marketPDA] = getMarketPDA(marketId);
        const [positionPDA] = getPositionPDA(marketId, wallet.publicKey);
        const [collateralVaultPDA] = getCollateralVaultPDA(marketId);
        const startTime = Date.now();

        const logId = addLog({
            instruction: 'supply_collateral',
            status: 'pending',
            params: {
                marketId: marketId.toString('hex'),
                amount: amount.toString(),
                collateralMint: collateralMint.toString(),
            },
            accounts: {
                owner: wallet.publicKey.toString(),
                market: marketPDA.toString(),
                position: positionPDA.toString(),
                collateralVault: collateralVaultPDA.toString(),
            },
        });

        const { ata: userTokenAccount, ix: createAtaIx } = await ensureATA(wallet.publicKey, collateralMint);

        try {
            const preInstructions = createAtaIx ? [createAtaIx] : [];

            const posInfo = await connection.getAccountInfo(positionPDA);
            if (!posInfo) {
                const createPosIx = await program.methods
                    .createPosition(marketIdArray)
                    .accounts({
                        payer: wallet.publicKey,
                        position: positionPDA,
                        market: marketPDA,
                        owner: wallet.publicKey,
                        systemProgram: SystemProgram.programId,
                    })
                    .instruction();
                preInstructions.push(createPosIx);
            }

            const tx = await program.methods
                .supplyCollateral(marketIdArray, new BN(amount.toString()))
                .accounts({
                    owner: wallet.publicKey,
                    market: marketPDA,
                    position: positionPDA,
                    senderTokenAccount: userTokenAccount,
                    collateralVault: collateralVaultPDA,
                    collateralMint: collateralMint,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .preInstructions(preInstructions)
                .rpc();

            updateLog(logId, {
                status: 'success',
                signature: tx,
                duration: Date.now() - startTime
            });
            toast.success(`Supplied collateral successfully`);
            return tx;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            updateLog(logId, {
                status: 'error',
                error: errorMsg,
                duration: Date.now() - startTime
            });
            console.error('Supply Collateral error:', error);
            toast.error('Failed to supply collateral');
            throw error;
        }
    }, [getProgram, connection, wallet.publicKey, ensureATA, addLog, updateLog]);

    // Withdraw Loan Assets
    const withdraw = useCallback(async (
        marketId: Buffer,
        amount: bigint,
        remainingShares: bigint,
        loanMint: PublicKey
    ) => {
        const program = getProgram();
        if (!program || !wallet.publicKey) throw new Error('Wallet not connected');

        const marketIdArray = Array.from(marketId);
        const [protocolStatePDA] = getProtocolStatePDA();
        const [marketPDA] = getMarketPDA(marketId);
        const [positionPDA] = getPositionPDA(marketId, wallet.publicKey);
        const [loanVaultPDA] = getLoanVaultPDA(marketId);
        const startTime = Date.now();

        const logId = addLog({
            instruction: 'withdraw',
            status: 'pending',
            params: {
                marketId: marketId.toString('hex'),
                amount: amount.toString(),
            },
            accounts: {
                caller: wallet.publicKey.toString(),
                market: marketPDA.toString(),
                position: positionPDA.toString(),
                loanVault: loanVaultPDA.toString(),
            },
        });

        const { ata: userTokenAccount, ix: createAtaIx } = await ensureATA(wallet.publicKey, loanMint);

        try {
            const preInstructions = createAtaIx ? [createAtaIx] : [];

            const tx = await program.methods
                .withdraw(marketIdArray, new BN(amount.toString()), new BN(0))
                .accounts({
                    caller: wallet.publicKey,
                    protocolState: protocolStatePDA,
                    market: marketPDA,
                    position: positionPDA,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    authorization: null as any,
                    receiverTokenAccount: userTokenAccount,
                    loanVault: loanVaultPDA,
                    loanMint: loanMint,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .preInstructions(preInstructions)
                .rpc();

            updateLog(logId, {
                status: 'success',
                signature: tx,
                duration: Date.now() - startTime
            });
            toast.success(`Withdrawn successfully`);
            return tx;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            updateLog(logId, {
                status: 'error',
                error: errorMsg,
                duration: Date.now() - startTime
            });
            console.error('Withdraw error:', error);
            toast.error('Failed to withdraw');
            throw error;
        }
    }, [getProgram, connection, wallet.publicKey, ensureATA, addLog, updateLog]);

    // Withdraw Collateral
    const withdrawCollateral = useCallback(async (
        marketId: Buffer,
        amount: bigint,
        collateralMint: PublicKey
    ) => {
        const program = getProgram();
        if (!program || !wallet.publicKey) throw new Error('Wallet not connected');

        const marketIdArray = Array.from(marketId);
        const [protocolStatePDA] = getProtocolStatePDA();
        const [marketPDA] = getMarketPDA(marketId);
        const [positionPDA] = getPositionPDA(marketId, wallet.publicKey);
        const [collateralVaultPDA] = getCollateralVaultPDA(marketId);
        const startTime = Date.now();

        const logId = addLog({
            instruction: 'withdraw_collateral',
            status: 'pending',
            params: {
                marketId: marketId.toString('hex'),
                amount: amount.toString(),
            },
            accounts: {
                caller: wallet.publicKey.toString(),
                market: marketPDA.toString(),
                position: positionPDA.toString(),
                collateralVault: collateralVaultPDA.toString(),
            },
        });

        const { ata: userTokenAccount, ix: createAtaIx } = await ensureATA(wallet.publicKey, collateralMint);

        try {
            const preInstructions = createAtaIx ? [createAtaIx] : [];

            const tx = await program.methods
                .withdrawCollateral(marketIdArray, new BN(amount.toString()))
                .accounts({
                    caller: wallet.publicKey,
                    protocolState: protocolStatePDA,
                    market: marketPDA,
                    position: positionPDA,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    authorization: null as any,
                    receiverTokenAccount: userTokenAccount,
                    collateralVault: collateralVaultPDA,
                    collateralMint: collateralMint,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .preInstructions(preInstructions)
                .rpc();

            updateLog(logId, {
                status: 'success',
                signature: tx,
                duration: Date.now() - startTime
            });
            toast.success(`Withdrawn collateral successfully`);
            return tx;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            updateLog(logId, {
                status: 'error',
                error: errorMsg,
                duration: Date.now() - startTime
            });
            console.error('Withdraw Collateral error:', error);
            toast.error('Failed to withdraw collateral');
            throw error;
        }
    }, [getProgram, connection, wallet.publicKey, ensureATA, addLog, updateLog]);

    // Borrow
    const borrow = useCallback(async (
        marketId: Buffer,
        amount: bigint,
        loanMint: PublicKey,
        oracle: PublicKey
    ) => {
        const program = getProgram();
        if (!program || !wallet.publicKey) throw new Error('Wallet not connected');

        const marketIdArray = Array.from(marketId);
        const [protocolStatePDA] = getProtocolStatePDA();
        const [marketPDA] = getMarketPDA(marketId);
        const [positionPDA] = getPositionPDA(marketId, wallet.publicKey);
        const [loanVaultPDA] = getLoanVaultPDA(marketId);
        const startTime = Date.now();

        const logId = addLog({
            instruction: 'borrow',
            status: 'pending',
            params: {
                marketId: marketId.toString('hex'),
                amount: amount.toString(),
                oracle: oracle.toString(),
            },
            accounts: {
                caller: wallet.publicKey.toString(),
                market: marketPDA.toString(),
                position: positionPDA.toString(),
                loanVault: loanVaultPDA.toString(),
            },
        });

        const { ata: userTokenAccount, ix: createAtaIx } = await ensureATA(wallet.publicKey, loanMint);

        try {
            const preInstructions = createAtaIx ? [createAtaIx] : [];

            const tx = await program.methods
                .borrow(marketIdArray, new BN(amount.toString()), new BN(0))
                .accounts({
                    caller: wallet.publicKey,
                    protocolState: protocolStatePDA,
                    market: marketPDA,
                    position: positionPDA,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    authorization: null as any,
                    oracle: oracle,
                    receiverTokenAccount: userTokenAccount,
                    loanVault: loanVaultPDA,
                    loanMint: loanMint,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .preInstructions(preInstructions)
                .rpc();

            updateLog(logId, {
                status: 'success',
                signature: tx,
                duration: Date.now() - startTime
            });
            toast.success(`Borrowed successfully`);
            return tx;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            updateLog(logId, {
                status: 'error',
                error: errorMsg,
                duration: Date.now() - startTime
            });
            console.error('Borrow error:', error);
            toast.error('Failed to borrow');
            throw error;
        }
    }, [getProgram, connection, wallet.publicKey, ensureATA, addLog, updateLog]);

    // Repay
    const repay = useCallback(async (
        marketId: Buffer,
        amount: bigint,
        loanMint: PublicKey
    ) => {
        const program = getProgram();
        if (!program || !wallet.publicKey) throw new Error('Wallet not connected');

        const marketIdArray = Array.from(marketId);
        const [marketPDA] = getMarketPDA(marketId);
        const [positionPDA] = getPositionPDA(marketId, wallet.publicKey);
        const [loanVaultPDA] = getLoanVaultPDA(marketId);
        const startTime = Date.now();

        const logId = addLog({
            instruction: 'repay',
            status: 'pending',
            params: {
                marketId: marketId.toString('hex'),
                amount: amount.toString(),
            },
            accounts: {
                repayer: wallet.publicKey.toString(),
                market: marketPDA.toString(),
                position: positionPDA.toString(),
                loanVault: loanVaultPDA.toString(),
            },
        });

        const { ata: userTokenAccount, ix: createAtaIx } = await ensureATA(wallet.publicKey, loanMint);

        try {
            const preInstructions = createAtaIx ? [createAtaIx] : [];

            const tx = await program.methods
                .repay(marketIdArray, new BN(amount.toString()), new BN(0))
                .accounts({
                    repayer: wallet.publicKey,
                    market: marketPDA,
                    position: positionPDA,
                    onBehalfOf: wallet.publicKey,
                    repayerTokenAccount: userTokenAccount,
                    loanVault: loanVaultPDA,
                    loanMint: loanMint,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .preInstructions(preInstructions)
                .rpc();

            updateLog(logId, {
                status: 'success',
                signature: tx,
                duration: Date.now() - startTime
            });
            toast.success(`Repaid successfully`);
            return tx;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            updateLog(logId, {
                status: 'error',
                error: errorMsg,
                duration: Date.now() - startTime
            });
            console.error('Repay error:', error);
            toast.error('Failed to repay');
            throw error;
        }
    }, [getProgram, connection, wallet.publicKey, ensureATA, addLog, updateLog]);

    return {
        initializeProtocol,
        createMarket,
        supply,
        supplyCollateral,
        withdraw,
        withdrawCollateral,
        borrow,
        repay,
    };
}
