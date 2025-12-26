'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useLiquidatablePositions, useMarkets, OnChainPosition } from '@/lib/hooks/useOnChainData';
import { useState } from 'react';
import {
    TrendingDown,
    DollarSign,
    AlertTriangle,
    Zap,
    Target,
    Search,
    AlertCircle,
} from 'lucide-react';

function EmptyLiquidationsState() {
    return (
        <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="p-4 rounded-full bg-green-100 dark:bg-green-900 mb-4">
                    <Target className="h-12 w-12 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No Liquidation Opportunities</h3>
                <p className="text-muted-foreground max-w-md">
                    All positions are currently healthy. Check back later for liquidation opportunities.
                </p>
            </CardContent>
        </Card>
    );
}

export default function LiquidationsPage() {
    const { connected } = useWallet();
    const { data: positions, isLoading } = useLiquidatablePositions();
    const { data: markets } = useMarkets();
    const [search, setSearch] = useState('');
    const [selectedPos, setSelectedPos] = useState<OnChainPosition | null>(null);
    const [seizedAmount, setSeizedAmount] = useState('');

    if (!connected) {
        return (
            <div className="container py-16">
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                    <div className="p-4 rounded-full bg-secondary">
                        <Target className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <h1 className="text-3xl font-bold">Liquidation Scanner</h1>
                    <p className="text-muted-foreground max-w-md">
                        Connect your wallet to view and execute liquidation opportunities.
                    </p>
                    <WalletMultiButton />
                </div>
            </div>
        );
    }

    const filteredPositions = positions?.filter((pos) => {
        const borrowerStr = pos.account.owner.toString();
        return borrowerStr.includes(search);
    }) || [];

    return (
        <div className="container py-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Liquidations</h1>
                    <p className="text-muted-foreground mt-2">
                        Find and liquidate unhealthy positions
                    </p>
                </div>
                <Badge variant={filteredPositions.length > 0 ? 'destructive' : 'outline'} className="px-4 py-2">
                    <AlertTriangle className="w-4 h-4 mr-2" />
                    {isLoading ? '...' : filteredPositions.length} Opportunities
                </Badge>
            </div>

            {/* Stats */}
            <div className="grid md:grid-cols-3 gap-4 mb-8">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Positions with Borrows
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <div className="text-2xl font-bold text-red-600">
                                {filteredPositions.length}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Total Markets
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{markets?.length || 0}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Max LIF
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-purple-600">1.15x</div>
                    </CardContent>
                </Card>
            </div>

            {/* Search */}
            <Card className="mb-6">
                <CardContent className="pt-6">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                        <Input
                            placeholder="Search by borrower address..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </CardContent>
            </Card>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Opportunities List */}
                <div className="lg:col-span-2">
                    {isLoading ? (
                        <Card>
                            <CardContent className="py-8">
                                <div className="space-y-4">
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                </div>
                            </CardContent>
                        </Card>
                    ) : filteredPositions.length > 0 ? (
                        <Card>
                            <CardHeader>
                                <CardTitle>Positions with Active Borrows</CardTitle>
                                <CardDescription>
                                    Instruction: liquidate() - Repay debt and seize collateral with bonus
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Borrower</TableHead>
                                            <TableHead>Collateral</TableHead>
                                            <TableHead>Borrow Shares</TableHead>
                                            <TableHead></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredPositions.map((pos) => (
                                            <TableRow key={pos.publicKey.toString()}>
                                                <TableCell className="font-mono text-sm">
                                                    {pos.account.owner.toString().slice(0, 8)}...
                                                </TableCell>
                                                <TableCell>
                                                    {(Number(pos.account.collateral) / 1e9).toFixed(6)}
                                                </TableCell>
                                                <TableCell className="text-red-600 font-semibold">
                                                    {(Number(pos.account.borrowShares) / 1e9).toFixed(4)}
                                                </TableCell>
                                                <TableCell>
                                                    <Button size="sm" variant="destructive" onClick={() => setSelectedPos(pos)}>
                                                        <Zap className="w-3 h-3 mr-1" />
                                                        Check
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    ) : (
                        <EmptyLiquidationsState />
                    )}
                </div>

                {/* Liquidation Panel */}
                <div className="lg:col-span-1">
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingDown className="w-5 h-5" />
                                Liquidation Panel
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {selectedPos ? (
                                <>
                                    <Alert>
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertTitle>Selected Position</AlertTitle>
                                        <AlertDescription className="font-mono text-xs">
                                            {selectedPos.account.owner.toString().slice(0, 16)}...
                                        </AlertDescription>
                                    </Alert>

                                    <div className="space-y-2 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Collateral</span>
                                            <span className="font-mono">{(Number(selectedPos.account.collateral) / 1e9).toFixed(6)}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Borrow Shares</span>
                                            <span className="text-red-600 font-semibold">{(Number(selectedPos.account.borrowShares) / 1e9).toFixed(4)}</span>
                                        </div>
                                    </div>

                                    <Alert variant="destructive">
                                        <AlertCircle className="h-4 w-4" />
                                        <AlertTitle>Oracle Required</AlertTitle>
                                        <AlertDescription>
                                            Health factor calculation requires oracle price data.
                                        </AlertDescription>
                                    </Alert>

                                    <div>
                                        <label className="text-sm font-medium">Amount to Seize</label>
                                        <div className="flex gap-2 mt-1">
                                            <Input
                                                type="number"
                                                value={seizedAmount}
                                                onChange={(e) => setSeizedAmount(e.target.value)}
                                                placeholder="0.00"
                                            />
                                            <Button variant="outline">MAX</Button>
                                        </div>
                                    </div>

                                    <Button className="w-full" variant="destructive" disabled={!seizedAmount}>
                                        <Zap className="w-4 h-4 mr-2" />
                                        Execute Liquidation
                                    </Button>
                                </>
                            ) : (
                                <div className="text-center text-muted-foreground py-8">
                                    <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p>Select a position to analyze</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
