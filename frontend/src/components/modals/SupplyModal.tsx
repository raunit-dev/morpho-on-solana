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
import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { toast } from "sonner";
import { useMorphoProgram, deriveProtocolState, deriveMarket, derivePosition } from "@/lib/anchor-client";
import { BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID } from "@solana/spl-token";

interface SupplyModalProps {
    marketId: string;
    tokenSymbol: string;
    apy: number;
    loanMint?: string;
}

export function SupplyModal({ marketId, tokenSymbol, apy, loanMint }: SupplyModalProps) {
    const { connected, publicKey } = useWallet();
    const { program } = useMorphoProgram();
    const [amount, setAmount] = useState("");
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSupply = async () => {
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

            // For demo, use a mock loan mint
            const loanMintPubkey = loanMint
                ? new PublicKey(loanMint)
                : new PublicKey("So11111111111111111111111111111111111111112"); // Wrapped SOL

            const supplierTokenAccount = await getAssociatedTokenAddress(
                loanMintPubkey,
                publicKey
            );

            const loanVault = PublicKey.findProgramAddressSync(
                [Buffer.from("morpho"), Buffer.from("loan_vault"), marketIdBytes],
                program.programId
            )[0];

            const amountBN = new BN(parseFloat(amount) * 1e9); // Assuming 9 decimals

            await program.methods
                .supply(Array.from(marketIdBytes), amountBN, new BN(0))
                .accounts({
                    supplier: publicKey,
                    protocolState,
                    market,
                    position,
                    onBehalfOf: publicKey,
                    supplierTokenAccount,
                    loanVault,
                    loanMint: loanMintPubkey,
                    tokenProgram: TOKEN_PROGRAM_ID,
                })
                .rpc();

            toast.success("Supply Successful", {
                description: `Supplied ${amount} ${tokenSymbol}`,
            });
            setOpen(false);
            setAmount("");
        } catch (error) {
            console.error("Supply error:", error);
            toast.error("Supply Failed", {
                description: error instanceof Error ? error.message : "Transaction failed",
            });
        } finally {
            setLoading(false);
        }
    };

    if (!connected) {
        return <Button disabled>Connect Wallet to Supply</Button>;
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button>Supply</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Supply {tokenSymbol}</DialogTitle>
                    <DialogDescription>
                        Earn {apy}% APY by lending your assets on devnet.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label htmlFor="amount">Amount</Label>
                        <div className="relative">
                            <Input
                                id="amount"
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                type="number"
                                className="pr-16"
                            />
                            <Button
                                variant="ghost"
                                size="sm"
                                className="absolute right-0 top-0 h-full text-muted-foreground hover:text-foreground"
                                onClick={() => setAmount("1.00")}
                            >
                                MAX
                            </Button>
                        </div>
                    </div>

                    <div className="rounded-lg bg-secondary p-4 space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Network</span>
                            <span className="font-medium text-orange-500">Devnet</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Exchange Rate</span>
                            <span className="font-medium">1 {tokenSymbol} = 1.0 share</span>
                        </div>
                    </div>
                </div>
                <Button onClick={handleSupply} className="w-full" disabled={!amount || loading}>
                    {loading ? "Processing..." : "Confirm Supply"}
                </Button>
            </DialogContent>
        </Dialog>
    );
}
