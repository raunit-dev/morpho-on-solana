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
import { useWallet } from "@/lib/mock-wallet";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { AlertCircle } from "lucide-react";

interface BorrowModalProps {
    marketId: string;
    tokenSymbol: string;
    collateralSymbol: string;
    lltv: number;
    borrowApy: number;
}

export function BorrowModal({
    marketId,
    tokenSymbol,
    collateralSymbol,
    lltv,
    borrowApy
}: BorrowModalProps) {
    const { connected, connect } = useWallet();
    const [amount, setAmount] = useState("");
    const [targetLtv, setTargetLtv] = useState(0);
    const [open, setOpen] = useState(false);

    // Auto-calculate amount based on LTV slider (mock logic)
    useEffect(() => {
        if (targetLtv > 0) {
            // Assuming 1000 collateral value for mock
            const borrowPower = 1000 * (targetLtv / 100);
            setAmount(borrowPower.toFixed(2));
        }
    }, [targetLtv]);

    const handleBorrow = () => {
        if (!amount) return;

        toast.promise(new Promise((resolve) => setTimeout(resolve, 2000)), {
            loading: 'Processing borrow...',
            success: () => {
                setOpen(false);
                setAmount("");
                return `Successfully borrowed ${amount} ${tokenSymbol}`;
            },
            error: 'Transaction failed',
        });
    };

    if (!connected) {
        return <Button onClick={connect}>Connect to Borrow</Button>;
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
                        Collateral: {collateralSymbol} | Max LTV: {lltv}%
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
                                    // Mock update LTV based on amount
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
                            className={targetLtv > 80 ? "text-red-500" : ""}
                        />
                        {targetLtv > 80 && (
                            <p className="text-xs text-red-500 flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" /> High risk of liquidation
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Card className="p-3 bg-secondary/50 border-none">
                            <div className="text-xs text-muted-foreground">Liquidation Price</div>
                            <div className="text-lg font-mono font-medium">$1,850.20</div>
                        </Card>
                        <Card className="p-3 bg-secondary/50 border-none">
                            <div className="text-xs text-muted-foreground">Borrow APY</div>
                            <div className="text-lg font-mono font-medium text-red-500">{borrowApy}%</div>
                        </Card>
                    </div>
                </div>
                <Button onClick={handleBorrow} className="w-full" disabled={!amount}>
                    Confirm Borrow
                </Button>
            </DialogContent>
        </Dialog>
    );
}
