'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useMarkets } from '@/lib/hooks/useOnChainData';
import { BarChart3, DollarSign, TrendingUp, Users, Plus, AlertCircle } from 'lucide-react';
import { Lock, TrendingDown } from 'lucide-react';

function formatNumber(num: number, decimals: number = 2): string {
    if (num >= 1_000_000) {
        return `$${(num / 1_000_000).toFixed(decimals)}M`;
    } else if (num >= 1_000) {
        return `$${(num / 1_000).toFixed(decimals)}K`;
    }
    return `$${num.toFixed(decimals)}`;
}

function MarketCardSkeleton() {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-4 w-20 mt-2" />
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </div>
                <Skeleton className="h-2 w-full" />
            </CardContent>
        </Card>
    );
}

function EmptyMarketsState() {
    return (
        <Card className="col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <div className="p-4 rounded-full bg-secondary mb-4">
                    <BarChart3 className="h-12 w-12 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">No Markets Found</h3>
                <p className="text-muted-foreground max-w-md mb-6">
                    No lending markets have been created yet. Markets must be created by the protocol admin using the <code className="bg-secondary px-1 rounded">create_market</code> instruction.
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-secondary px-4 py-2 rounded-lg">
                    <AlertCircle className="h-4 w-4" />
                    Connect as admin to create the first market
                </div>
            </CardContent>
        </Card>
    );
}

export default function MarketsPage() {
    const { data: markets, isLoading, error } = useMarkets();

    // Calculate stats from real data
    const totalTVL = markets?.reduce((acc, m) => acc + Number(m.account.totalSupplyAssets) / 1e6, 0) || 0;
    const totalBorrowed = markets?.reduce((acc, m) => acc + Number(m.account.totalBorrowAssets) / 1e6, 0) || 0;
    const activeMarkets = markets?.filter(m => !m.account.paused).length || 0;

    return (
        <div className="container py-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Markets</h1>
                    <p className="text-muted-foreground mt-2">
                        Explore and interact with isolated lending markets
                    </p>
                </div>
                <Badge variant="outline" className="px-4 py-2 text-lg">
                    <BarChart3 className="w-4 h-4 mr-2" />
                    {isLoading ? '...' : markets?.length || 0} Markets
                </Badge>
            </div>

            {/* Stats Cards */}
            <div className="grid md:grid-cols-4 gap-4 mb-8">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            Total Value Locked
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <div className="text-2xl font-bold">{formatNumber(totalTVL)}</div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" />
                            Total Borrowed
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-24" />
                        ) : (
                            <div className="text-2xl font-bold">{formatNumber(totalBorrowed)}</div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" />
                            Protocol Status
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600">Active</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Active Markets
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <Skeleton className="h-8 w-12" />
                        ) : (
                            <div className="text-2xl font-bold">{activeMarkets}</div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Markets Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {isLoading ? (
                    <>
                        <MarketCardSkeleton />
                        <MarketCardSkeleton />
                        <MarketCardSkeleton />
                    </>
                ) : markets && markets.length > 0 ? (
                    markets.map((market) => {
                        const totalSupply = Number(market.account.totalSupplyAssets) / 1e6;
                        const totalBorrow = Number(market.account.totalBorrowAssets) / 1e6;
                        const utilization = totalSupply > 0 ? (totalBorrow / totalSupply) * 100 : 0;
                        const lltv = market.account.lltv / 100;

                        return (
                            <Link key={market.publicKey.toString()} href={`/markets/${market.publicKey.toString()}`}>
                                <Card className="cursor-pointer hover:shadow-lg transition-all hover:border-indigo-500/50 h-full">
                                    <CardHeader>
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <CardTitle className="text-xl flex items-center gap-2">
                                                    <div className="flex -space-x-2">
                                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-xs font-bold border-2 border-background">
                                                            C
                                                        </div>
                                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold border-2 border-background">
                                                            L
                                                        </div>
                                                    </div>
                                                    Market
                                                </CardTitle>
                                                <CardDescription className="mt-1 font-mono text-xs">
                                                    {market.publicKey.toString().slice(0, 8)}...
                                                </CardDescription>
                                            </div>
                                            {market.account.paused && (
                                                <Badge variant="destructive">
                                                    <Lock className="w-3 h-3 mr-1" />
                                                    Paused
                                                </Badge>
                                            )}
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                                    <TrendingUp className="w-3 h-3" />
                                                    Total Supply
                                                </p>
                                                <p className="text-lg font-bold text-green-600">
                                                    {formatNumber(totalSupply)}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                                    <TrendingDown className="w-3 h-3" />
                                                    Total Borrow
                                                </p>
                                                <p className="text-lg font-bold text-orange-600">
                                                    {formatNumber(totalBorrow)}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-muted-foreground">LLTV</p>
                                                <p className="text-lg font-semibold">{lltv.toFixed(0)}%</p>
                                            </div>
                                            <div>
                                                <p className="text-sm text-muted-foreground">Fee</p>
                                                <p className="text-lg font-semibold">{(market.account.fee / 100).toFixed(2)}%</p>
                                            </div>
                                        </div>

                                        <div className="mt-4">
                                            <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                                <span>Utilization</span>
                                                <span>{utilization.toFixed(1)}%</span>
                                            </div>
                                            <div className="h-2 bg-secondary rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all"
                                                    style={{ width: `${Math.min(utilization, 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </Link>
                        );
                    })
                ) : (
                    <EmptyMarketsState />
                )}
            </div>
        </div>
    );
}
