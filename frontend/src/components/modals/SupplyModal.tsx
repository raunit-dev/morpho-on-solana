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
import { useWallet } from "@/lib/mock-wallet";
import { useState } from "react";
import { toast } from "sonner";

interface SupplyModalProps {
    marketId: string;
    tokenSymbol: string;
    apy: number;
}

export function SupplyModal({ marketId, tokenSymbol, apy }: SupplyModalProps) {
    const { connected, connect } = useWallet();
    const [amount, setAmount] = useState("");
    const [open, setOpen] = useState(false);

    const handleSupply = () => {
        if (!amount) return;

        // Simulate transaction
        toast.promise(new Promise((resolve) => setTimeout(resolve, 2000)), {
            loading: 'Supplying assets...',
            success: () => {
                setOpen(false);
                setAmount("");
                return `Successfully supplied ${amount} ${tokenSymbol}`;
            },
            error: 'Failed to supply assets',
        });
    };

    if (!connected) {
        return <Button onClick={connect}>Connect to Supply</Button>;
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
                        Earn {apy}% APY by lending your assets.
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
                                onClick={() => setAmount("100.00")}
                            >
                                MAX
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground text-right">
                            Balance: 145.23 {tokenSymbol}
                        </p>
                    </div>

                    <div className="rounded-lg bg-secondary p-4 space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">You will receive</span>
                            <span className="font-medium">{amount || "0"} shares</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Exchange Rate</span>
                            <span className="font-medium">1 {tokenSymbol} = 1.0 share</span>
                        </div>
                    </div>
                </div>
                <Button onClick={handleSupply} className="w-full" disabled={!amount}>
                    Confirm Supply
                </Button>
            </DialogContent>
        </Dialog>
    );
}
