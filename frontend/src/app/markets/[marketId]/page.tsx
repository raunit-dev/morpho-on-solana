'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useMarkets, useUserPositions } from '@/lib/hooks/useOnChainData';
import { PublicKey } from '@solana/web3.js';
import {
    TrendingUp,
    TrendingDown,
    Shield,
    Zap,
    DollarSign,
    AlertTriangle,
    CheckCircle,
    ArrowLeft,
    Lock,
    Users,
} from 'lucide-react';
import Link from 'next/link';

function formatNumber(num: number): string {
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
}

function HealthFactorBar({ healthFactor }: { healthFactor: number }) {
    const getColor = () => {
        if (healthFactor > 1.5) return 'bg-green-500';
        if (healthFactor > 1.2) return 'bg-yellow-500';
        if (healthFactor > 1.05) return 'bg-orange-500';
        return 'bg-red-500';
    };

    const getLabel = () => {
        if (healthFactor > 1.5) return 'Safe';
        if (healthFactor > 1.2) return 'Caution';
        if (healthFactor > 1.05) return 'Warning';
        return 'Critical';
    };

    const percentage = Math.min((healthFactor / 2) * 100, 100);

    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Health Factor</span>
                <span className={`font-mono text-lg font-bold ${healthFactor > 1.5 ? 'text-green-500' : healthFactor > 1.2 ? 'text-yellow-500' : 'text-red-500'}`}>
                    {healthFactor === Infinity ? '∞' : healthFactor.toFixed(2)}
                </span>
            </div>
            <div className="relative h-2 bg-secondary rounded-full overflow-hidden">
                <div className={`absolute h-full ${getColor()} transition-all`} style={{ width: `${percentage}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
                <span>{getLabel()}</span>
                <span>Liquidation at &lt;1.0</span>
            </div>
        </div>
    );
}

function MarketNotFound() {
    return (
        <div className="container py-8">
            <Link href="/markets" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Markets
            </Link>
            <Card>
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="p-4 rounded-full bg-secondary mb-4">
                        <AlertTriangle className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">Market Not Found</h3>
                    <p className="text-muted-foreground max-w-md">
                        This market does not exist or has not been created yet.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}

function SupplyTab({ market }: { market: { lltv: number; totalSupplyAssets: bigint } }) {
    const [amount, setAmount] = useState('');
    const { connected, publicKey } = useWallet();

    const handleSupply = () => {
        alert(`Supply ${amount} - Transaction pending...`);
    };

    if (!connected) {
        return (
            <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">Connect your wallet to supply</p>
                <WalletMultiButton />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Instruction: supply()</AlertTitle>
                <AlertDescription>Supply loan tokens to earn interest. Shares calculated with DOWN rounding.</AlertDescription>
            </Alert>

            <div>
                <label className="text-sm font-medium">Amount to Supply</label>
                <div className="flex gap-2 mt-1">
                    <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                    <Button variant="outline" onClick={() => setAmount('1000')}>MAX</Button>
                </div>
                <div className="text-xs text-muted-foreground mt-1">Check your wallet for balance</div>
            </div>

            <Card className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
                <CardContent className="pt-4">
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span>Current Market Supply</span>
                            <span className="font-mono">{formatNumber(Number(market.totalSupplyAssets) / 1e6)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Your Supply</span>
                            <span className="font-mono">{amount || '0'}</span>
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Button onClick={handleSupply} className="w-full" disabled={!amount}>
                <DollarSign className="w-4 h-4 mr-2" />
                Supply
            </Button>
        </div>
    );
}

function WithdrawTab() {
    const [mode, setMode] = useState<'assets' | 'shares'>('assets');
    const [amount, setAmount] = useState('');
    const { connected } = useWallet();

    if (!connected) {
        return (
            <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">Connect your wallet to withdraw</p>
                <WalletMultiButton />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Instruction: withdraw()</AlertTitle>
                <AlertDescription>Specify EITHER assets OR shares (not both).</AlertDescription>
            </Alert>

            <div className="flex gap-2">
                <Button variant={mode === 'assets' ? 'default' : 'outline'} onClick={() => setMode('assets')} className="flex-1">By Amount</Button>
                <Button variant={mode === 'shares' ? 'default' : 'outline'} onClick={() => setMode('shares')} className="flex-1">By Shares</Button>
            </div>

            <div>
                <label className="text-sm font-medium">{mode === 'assets' ? 'Amount to Withdraw' : 'Shares to Burn'}</label>
                <div className="flex gap-2 mt-1">
                    <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                    <Button variant="outline">MAX</Button>
                </div>
                <div className="text-xs text-muted-foreground mt-1">Your supply position will be shown here</div>
            </div>

            <Button onClick={() => alert('Withdraw pending...')} className="w-full" variant="outline" disabled={!amount}>
                <TrendingDown className="w-4 h-4 mr-2" />
                Withdraw
            </Button>
        </div>
    );
}

function CollateralTab() {
    const [action, setAction] = useState<'deposit' | 'withdraw'>('deposit');
    const [amount, setAmount] = useState('');
    const { connected } = useWallet();

    if (!connected) {
        return (
            <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">Connect wallet</p>
                <WalletMultiButton />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Instruction: {action === 'deposit' ? 'supply_collateral()' : 'withdraw_collateral()'}</AlertTitle>
                <AlertDescription>
                    {action === 'deposit' ? 'Deposit collateral to increase borrow capacity.' : 'Withdraw collateral (health check applied).'}
                </AlertDescription>
            </Alert>

            <div className="flex gap-2">
                <Button variant={action === 'deposit' ? 'default' : 'outline'} onClick={() => setAction('deposit')} className="flex-1">
                    <TrendingUp className="w-4 h-4 mr-2" />Deposit
                </Button>
                <Button variant={action === 'withdraw' ? 'default' : 'outline'} onClick={() => setAction('withdraw')} className="flex-1">
                    <TrendingDown className="w-4 h-4 mr-2" />Withdraw
                </Button>
            </div>

            <div>
                <label className="text-sm font-medium">Amount</label>
                <div className="flex gap-2 mt-1">
                    <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                    <Button variant="outline">MAX</Button>
                </div>
            </div>

            <Button onClick={() => alert(`${action} collateral...`)} className="w-full" disabled={!amount}>
                <Shield className="w-4 h-4 mr-2" />
                {action === 'deposit' ? 'Deposit' : 'Withdraw'} Collateral
            </Button>
        </div>
    );
}

function BorrowTab({ market }: { market: { lltv: number; totalBorrowAssets: bigint } }) {
    const [amount, setAmount] = useState('');
    const { connected } = useWallet();

    if (!connected) {
        return (
            <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">Connect wallet to borrow</p>
                <WalletMultiButton />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Instruction: borrow()</AlertTitle>
                <AlertDescription>Borrow against your collateral. Health check applied.</AlertDescription>
            </Alert>

            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Collateral Required</AlertTitle>
                <AlertDescription>You must deposit collateral before borrowing.</AlertDescription>
            </Alert>

            <div>
                <label className="text-sm font-medium">Amount to Borrow</label>
                <div className="flex gap-2 mt-1">
                    <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                    <Button variant="outline">MAX</Button>
                </div>
                <div className="text-xs text-muted-foreground mt-1">LLTV: {(market.lltv / 100).toFixed(0)}%</div>
            </div>

            <Card className="bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800">
                <CardContent className="pt-4">
                    <HealthFactorBar healthFactor={Infinity} />
                </CardContent>
            </Card>

            <Button onClick={() => alert('Borrow pending...')} className="w-full" disabled={!amount}>
                <TrendingDown className="w-4 h-4 mr-2" />
                Borrow
            </Button>
        </div>
    );
}

function RepayTab() {
    const [mode, setMode] = useState<'assets' | 'shares'>('assets');
    const [amount, setAmount] = useState('');
    const { connected } = useWallet();

    if (!connected) {
        return (
            <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">Connect wallet</p>
                <WalletMultiButton />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertTitle>Instruction: repay()</AlertTitle>
                <AlertDescription>Repay borrowed tokens. Specify EITHER assets OR shares.</AlertDescription>
            </Alert>

            <div className="flex gap-2">
                <Button variant={mode === 'assets' ? 'default' : 'outline'} onClick={() => setMode('assets')} className="flex-1">By Amount</Button>
                <Button variant={mode === 'shares' ? 'default' : 'outline'} onClick={() => setMode('shares')} className="flex-1">By Shares</Button>
            </div>

            <div>
                <label className="text-sm font-medium">{mode === 'assets' ? 'Amount to Repay' : 'Shares to Burn'}</label>
                <div className="flex gap-2 mt-1">
                    <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                    <Button variant="outline">MAX</Button>
                </div>
            </div>

            <Button onClick={() => alert('Repay pending...')} className="w-full" variant="outline" disabled={!amount}>
                <TrendingUp className="w-4 h-4 mr-2" />
                Repay
            </Button>
        </div>
    );
}

function FlashLoanTab({ market }: { market: { totalSupplyAssets: bigint; totalBorrowAssets: bigint } }) {
    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState<'single' | 'two-step'>('single');
    const { connected } = useWallet();

    const availableLiquidity = Number(market.totalSupplyAssets - market.totalBorrowAssets) / 1e6;

    if (!connected) {
        return (
            <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">Connect wallet</p>
                <WalletMultiButton />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <Alert>
                <Zap className="h-4 w-4" />
                <AlertTitle>Flash Loan Instructions</AlertTitle>
                <AlertDescription>
                    {mode === 'single' ? 'flash_loan(): Single-instruction atomic loan' : 'flash_loan_start() + flash_loan_end(): Two-step with market lock'}
                </AlertDescription>
            </Alert>

            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Flash Loan Warning</AlertTitle>
                <AlertDescription>
                    During a flash loan, the market is LOCKED. Repay within the same transaction.
                </AlertDescription>
            </Alert>

            <div className="flex gap-2">
                <Button variant={mode === 'single' ? 'default' : 'outline'} onClick={() => setMode('single')} className="flex-1">Single Instruction</Button>
                <Button variant={mode === 'two-step' ? 'default' : 'outline'} onClick={() => setMode('two-step')} className="flex-1">Two-Step</Button>
            </div>

            <div>
                <label className="text-sm font-medium">Flash Loan Amount</label>
                <div className="flex gap-2 mt-1">
                    <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
                    <Button variant="outline" onClick={() => setAmount(availableLiquidity.toFixed(2))}>MAX</Button>
                </div>
                <div className="text-xs text-muted-foreground mt-1">Available: {formatNumber(availableLiquidity)}</div>
            </div>

            <Card className="bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800">
                <CardContent className="pt-4">
                    <div className="space-y-2 text-sm">
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

            <Button onClick={() => alert('Flash loan pending...')} className="w-full" disabled={!amount}>
                <Zap className="w-4 h-4 mr-2" />
                {mode === 'single' ? 'Execute Flash Loan' : 'Start Flash Loan'}
            </Button>
        </div>
    );
}

export default function MarketDetailPage() {
    const params = useParams();
    const { connected } = useWallet();
    const { data: markets, isLoading } = useMarkets();
    const { data: positions } = useUserPositions();

    const marketId = params.marketId as string;

    // Find market by public key
    const market = markets?.find(m => m.publicKey.toString() === marketId);

    // Find user position for this market
    const position = positions?.find(p => {
        const idHex = Buffer.from(p.account.marketId).toString('hex');
        const marketIdHex = market ? Buffer.from(market.account.id).toString('hex') : '';
        return idHex === marketIdHex;
    });

    if (isLoading) {
        return (
            <div className="container py-8">
                <Skeleton className="h-8 w-32 mb-6" />
                <div className="grid lg:grid-cols-3 gap-8">
                    <Skeleton className="h-64" />
                    <Skeleton className="h-96 lg:col-span-2" />
                </div>
            </div>
        );
    }

    if (!market) {
        return <MarketNotFound />;
    }

    const totalSupply = Number(market.account.totalSupplyAssets) / 1e6;
    const totalBorrow = Number(market.account.totalBorrowAssets) / 1e6;
    const utilization = totalSupply > 0 ? (totalBorrow / totalSupply) * 100 : 0;
    const lltv = market.account.lltv / 100;

    // Calculate position values
    const userSupply = position ? Number(position.account.supplyShares) / 1e9 : 0;
    const userBorrow = position ? Number(position.account.borrowShares) / 1e9 : 0;
    const userCollateral = position ? Number(position.account.collateral) / 1e9 : 0;
    const healthFactor = userBorrow > 0 ? (userCollateral * lltv) / userBorrow : Infinity;

    return (
        <div className="container py-8">
            <Link href="/markets" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Markets
            </Link>

            <div className="grid lg:grid-cols-3 gap-8">
                {/* Market Info */}
                <div className="lg:col-span-1 space-y-6">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="flex -space-x-2">
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold border-2 border-background">C</div>
                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold border-2 border-background">L</div>
                                </div>
                                <div>
                                    <CardTitle className="text-2xl">Market</CardTitle>
                                    <CardDescription className="font-mono text-xs">{marketId.slice(0, 16)}...</CardDescription>
                                </div>
                            </div>
                            {market.account.paused && <Badge variant="destructive"><Lock className="w-3 h-3 mr-1" />Paused</Badge>}
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-muted-foreground">Total Supply</p>
                                    <p className="text-xl font-bold text-green-600">{formatNumber(totalSupply)}</p>
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Total Borrow</p>
                                    <p className="text-xl font-bold text-orange-600">{formatNumber(totalBorrow)}</p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">LLTV</span>
                                    <span className="font-semibold">{lltv.toFixed(0)}%</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Fee</span>
                                    <span className="font-semibold">{(market.account.fee / 100).toFixed(2)}%</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Utilization</span>
                                    <span className="font-semibold">{utilization.toFixed(1)}%</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {connected && position && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Users className="w-5 h-5" />
                                    Your Position
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Supply Shares</span>
                                        <span className="font-semibold">{userSupply.toFixed(2)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Collateral</span>
                                        <span className="font-semibold">{userCollateral.toFixed(4)}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-muted-foreground">Borrow Shares</span>
                                        <span className="font-semibold">{userBorrow.toFixed(2)}</span>
                                    </div>
                                </div>
                                <HealthFactorBar healthFactor={healthFactor} />
                            </CardContent>
                        </Card>
                    )}

                    {connected && !position && (
                        <Card>
                            <CardContent className="py-8 text-center">
                                <p className="text-muted-foreground">No position in this market</p>
                                <p className="text-sm text-muted-foreground mt-2">Supply or deposit collateral to start</p>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* Operations Tabs */}
                <div className="lg:col-span-2">
                    <Card>
                        <CardContent className="pt-6">
                            <Tabs defaultValue="supply">
                                <TabsList className="grid grid-cols-6 w-full">
                                    <TabsTrigger value="supply">Supply</TabsTrigger>
                                    <TabsTrigger value="withdraw">Withdraw</TabsTrigger>
                                    <TabsTrigger value="collateral">Collateral</TabsTrigger>
                                    <TabsTrigger value="borrow">Borrow</TabsTrigger>
                                    <TabsTrigger value="repay">Repay</TabsTrigger>
                                    <TabsTrigger value="flash">Flash</TabsTrigger>
                                </TabsList>
                                <div className="mt-6">
                                    <TabsContent value="supply"><SupplyTab market={market.account} /></TabsContent>
                                    <TabsContent value="withdraw"><WithdrawTab /></TabsContent>
                                    <TabsContent value="collateral"><CollateralTab /></TabsContent>
                                    <TabsContent value="borrow"><BorrowTab market={market.account} /></TabsContent>
                                    <TabsContent value="repay"><RepayTab /></TabsContent>
                                    <TabsContent value="flash"><FlashLoanTab market={market.account} /></TabsContent>
                                </div>
                            </Tabs>
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
