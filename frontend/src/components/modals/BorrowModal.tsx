"use client";

import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import { useWallet } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useMorphoProgram, deriveProtocolState, deriveMarket, derivePosition } from "@/lib/anchor-client";
import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { AlertCircle } from "lucide-react";

interface BorrowModalProps {
    marketId: string;
    tokenSymbol: string;
    collateralSymbol: string;
    lltv: number;
    borrowApy: number;
    loanMint?: string;
}

export function BorrowModal({
    marketId,
    tokenSymbol,
    collateralSymbol,
    lltv,
    borrowApy,
    loanMint,
}: BorrowModalProps) {
    const { connected, publicKey } = useWallet();
    const { program } = useMorphoProgram();
    const [amount, setAmount] = useState("");
    const [targetLtv, setTargetLtv] = useState(0);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (targetLtv > 0) {
            const borrowPower = 1000 * (targetLtv / 100);
            setAmount(borrowPower.toFixed(2));
        }
    }, [targetLtv]);

    const handleBorrow = async () => {
        if (!amount || !program || !publicKey) return;

        setLoading(true);
        try {
            // Convert market_id string to bytes
            const marketIdBytes = new Uint8Array(32).fill(0);
            const encoder = new TextEncoder();
            const encoded = encoder.encode(marketId);
            marketIdBytes.set(encoded.slice(0, 32));

            const [protocolState] = deriveProtocolState();
            const [market] = deriveMarket(marketIdBytes);
            const [position] = derivePosition(marketIdBytes, publicKey);

            const loanMintPubkey = loanMint
                ? new PublicKey(loanMint)
                : new PublicKey("So11111111111111111111111111111111111111112");

            const receiverTokenAccount = await getAssociatedTokenAddress(
                loanMintPubkey,
                publicKey
            );

            const loanVault = PublicKey.findProgramAddressSync(
                [Buffer.from("morpho"), Buffer.from("loan_vault"), marketIdBytes],
                program.programId
            )[0];

            const amountBN = new BN(parseFloat(amount) * 1e9);

            // Note: In production, you'd need an actual oracle account
            const mockOracle = PublicKey.default;

            await program.methods
                .borrow(Array.from(marketIdBytes), amountBN, new BN(0))
                .accounts({
                    caller: publicKey,
                    protocolState,
                    market,
                    position,
                    oracle: mockOracle,
                    receiverTokenAccount,
                    loanVault,
                    loanMint: loanMintPubkey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .rpc();

            toast.success("Borrow Successful", {
                description: `Borrowed ${amount} ${tokenSymbol}`,
            });
            setOpen(false);
            setAmount("");
        } catch (error) {
            console.error("Borrow error:", error);
            toast.error("Borrow Failed", {
                description: error instanceof Error ? error.message : "Transaction failed",
            });
        } finally {
            setLoading(false);
        }
    };

    if (!connected) {
        return <Button variant="secondary" disabled>Connect Wallet</Button>;
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="secondary">Borrow</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Borrow {tokenSymbol}</DialogTitle>
                    <DialogDescription>
                        Collateral: {collateralSymbol} | Max LTV: {lltv}% | Network: Devnet
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="amount">Borrow Amount</Label>
                        <div className="relative">
                            <Input
                                id="amount"
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => {
                                    setAmount(e.target.value);
                                    setTargetLtv(Math.min(Number(e.target.value) / 10, lltv));
                                }}
                                type="number"
                                className="pr-16"
                            />
                            <span className="absolute right-3 top-2 text-sm text-muted-foreground font-medium">
                                {tokenSymbol}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="flex justify-between">
                            <Label>Loan-to-Value (LTV)</Label>
                            <span className={targetLtv > 80 ? "text-red-500 font-bold" : "text-muted-foreground"}>
                                {targetLtv.toFixed(1)}%
                            </span>
                        </div>
                        <Slider
                            value={[targetLtv]}
                            max={lltv}
                            step={1}
                            onValueChange={(vals) => setTargetLtv(vals[0])}
                        />
                        {targetLtv > 80 && (
                            <p className="text-xs text-red-500 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" /> High risk of liquidation
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Card className="p-3 bg-secondary/50 border-none">
                            <div className="text-xs text-muted-foreground">Network</div>
                            <div className="text-lg font-mono font-medium text-orange-500">Devnet</div>
                        </Card>
                        <Card className="p-3 bg-secondary/50 border-none">
                            <div className="text-xs text-muted-foreground">Borrow APY</div>
                            <div className="text-lg font-mono font-medium text-red-500">{borrowApy}%</div>
                        </Card>
                    </div>
                </div>
                <Button onClick={handleBorrow} className="w-full" disabled={!amount || loading}>
                    {loading ? "Processing..." : "Confirm Borrow"}
                </Button>
            </DialogContent>
        </Dialog>
    );
}
