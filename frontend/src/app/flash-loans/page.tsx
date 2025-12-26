'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useMarkets } from '@/lib/hooks/useOnChainData';
import { useState } from 'react';
import {
    Zap,
    AlertTriangle,
    CheckCircle,
    Lock,
    Unlock,
    Code,
    AlertCircle,
} from 'lucide-react';

function formatNumber(num: number): string {
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
}

function EmptyMarketsAlert() {
    return (
        <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>No Markets Available</AlertTitle>
            <AlertDescription>
                No markets have been created yet. Flash loans require at least one active market with liquidity.
            </AlertDescription>
        </Alert>
    );
}

export default function FlashLoansPage() {
    const { connected } = useWallet();
    const { data: markets, isLoading } = useMarkets();
    const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState<'single' | 'start-end'>('single');

    // Get selected market
    const selectedMarket = markets?.find(m => m.publicKey.toString() === selectedMarketId);
    const availableLiquidity = selectedMarket
        ? (Number(selectedMarket.account.totalSupplyAssets) - Number(selectedMarket.account.totalBorrowAssets)) / 1e6
        : 0;

    if (!connected) {
        return (
            <div className="container py-16">
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                    <div className="p-4 rounded-full bg-secondary">
                        <Zap className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <h1 className="text-3xl font-bold">Flash Loans</h1>
                    <p className="text-muted-foreground max-w-md">
                        Borrow any amount instantly without collateral. Repay in the same transaction.
                    </p>
                    <WalletMultiButton />
                </div>
            </div>
        );
    }

    return (
        <div className="container py-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Flash Loans</h1>
                    <p className="text-muted-foreground mt-2">
                        Borrow without collateral - repay within the same transaction
                    </p>
                </div>
                <Badge variant="outline" className="px-4 py-2 text-lg">
                    <Zap className="w-4 h-4 mr-2 text-purple-500" />
                    0.05% Fee
                </Badge>
            </div>

            <div className="grid lg:grid-cols-2 gap-8">
                {/* Flash Loan Builder */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Zap className="w-5 h-5 text-purple-500" />
                            Flash Loan Builder
                        </CardTitle>
                        <CardDescription>
                            Build and execute flash loan transactions
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <Tabs value={mode} onValueChange={(v) => setMode(v as 'single' | 'start-end')}>
                            <TabsList className="w-full">
                                <TabsTrigger value="single" className="flex-1">
                                    Single Instruction
                                </TabsTrigger>
                                <TabsTrigger value="start-end" className="flex-1">
                                    Two-Step (Start/End)
                                </TabsTrigger>
                            </TabsList>

                            <TabsContent value="single" className="space-y-4 pt-4">
                                <Alert>
                                    <CheckCircle className="h-4 w-4" />
                                    <AlertTitle>flash_loan()</AlertTitle>
                                    <AlertDescription>
                                        Atomic flash loan - borrow and repay in a single instruction.
                                        Repayment validated via vault reload.
                                    </AlertDescription>
                                </Alert>
                            </TabsContent>

                            <TabsContent value="start-end" className="space-y-4 pt-4">
                                <Alert>
                                    <Lock className="h-4 w-4" />
                                    <AlertTitle>flash_loan_start() + flash_loan_end()</AlertTitle>
                                    <AlertDescription>
                                        Two-step flash loan - borrow with START, execute logic, repay with END.
                                        Market is LOCKED between calls.
                                    </AlertDescription>
                                </Alert>
                            </TabsContent>
                        </Tabs>

                        {isLoading ? (
                            <div className="space-y-2">
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                            </div>
                        ) : markets && markets.length > 0 ? (
                            <>
                                <div>
                                    <label className="text-sm font-medium">Select Market</label>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        {markets.map((market) => (
                                            <Button
                                                key={market.publicKey.toString()}
                                                variant={selectedMarketId === market.publicKey.toString() ? 'default' : 'outline'}
                                                onClick={() => setSelectedMarketId(market.publicKey.toString())}
                                                className="justify-start text-xs font-mono"
                                            >
                                                {market.publicKey.toString().slice(0, 8)}...
                                            </Button>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="text-sm font-medium">Flash Loan Amount</label>
                                    <div className="flex gap-2 mt-1">
                                        <Input
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder="0.00"
                                            disabled={!selectedMarket}
                                        />
                                        <Button
                                            variant="outline"
                                            onClick={() => setAmount(availableLiquidity.toFixed(2))}
                                            disabled={!selectedMarket}
                                        >
                                            MAX
                                        </Button>
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                        Available: {selectedMarket ? formatNumber(availableLiquidity) : 'Select a market'}
                                    </div>
                                </div>

                                <Card className="bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800">
                                    <CardContent className="pt-4">
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span>Flash Loan Amount</span>
                                                <span className="font-mono">${parseFloat(amount || '0').toLocaleString()}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span>Flash Fee (0.05%)</span>
                                                <span className="font-mono">${((parseFloat(amount) || 0) * 0.0005).toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between border-t pt-2">
                                                <span className="font-medium">Required Repayment</span>
                                                <span className="font-mono font-bold">${((parseFloat(amount) || 0) * 1.0005).toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </>
                        ) : (
                            <EmptyMarketsAlert />
                        )}

                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Important</AlertTitle>
                            <AlertDescription>
                                You must repay the loan + fee in the same transaction.
                                Failure to repay will revert the entire transaction.
                            </AlertDescription>
                        </Alert>

                        <Button className="w-full" disabled={!amount || !selectedMarket}>
                            <Zap className="w-4 h-4 mr-2" />
                            {mode === 'single' ? 'Execute Flash Loan' : 'Start Flash Loan'}
                        </Button>
                    </CardContent>
                </Card>

                {/* Documentation */}
                <div className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Code className="w-5 h-5" />
                                Flash Loan Instructions
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="p-4 bg-secondary rounded-lg">
                                <h4 className="font-semibold flex items-center gap-2 mb-2">
                                    <Zap className="w-4 h-4" /> flash_loan()
                                </h4>
                                <p className="text-sm text-muted-foreground mb-2">
                                    Single-instruction atomic flash loan. Ideal for simple arbitrage.
                                </p>
                                <div className="font-mono text-xs bg-background p-2 rounded">
                                    flash_loan(market_id, amount)
                                </div>
                            </div>

                            <div className="p-4 bg-secondary rounded-lg">
                                <h4 className="font-semibold flex items-center gap-2 mb-2">
                                    <Lock className="w-4 h-4" /> flash_loan_start()
                                </h4>
                                <p className="text-sm text-muted-foreground mb-2">
                                    Initiates flash loan and locks the market.
                                </p>
                                <div className="font-mono text-xs bg-background p-2 rounded">
                                    flash_loan_start(market_id, amount)
                                </div>
                            </div>

                            <div className="p-4 bg-secondary rounded-lg">
                                <h4 className="font-semibold flex items-center gap-2 mb-2">
                                    <Unlock className="w-4 h-4" /> flash_loan_end()
                                </h4>
                                <p className="text-sm text-muted-foreground mb-2">
                                    Completes flash loan and unlocks the market.
                                </p>
                                <div className="font-mono text-xs bg-background p-2 rounded">
                                    flash_loan_end(market_id, borrowed_amount)
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Use Cases</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-2 text-sm text-muted-foreground">
                                <li className="flex items-start gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                    <span><strong>Arbitrage:</strong> Exploit price differences across DEXs</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                    <span><strong>Collateral Swap:</strong> Change collateral without closing position</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                    <span><strong>Self-Liquidation:</strong> Close underwater positions efficiently</span>
                                </li>
                                <li className="flex items-start gap-2">
                                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5" />
                                    <span><strong>Leverage:</strong> Create leveraged positions atomically</span>
                                </li>
                            </ul>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
