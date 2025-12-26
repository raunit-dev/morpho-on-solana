'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lock, TrendingUp, TrendingDown } from 'lucide-react';
import Link from 'next/link';

export interface Market {
    id: string;
    collateralSymbol: string;
    loanSymbol: string;
    collateralMint: string;
    loanMint: string;
    supplyAPY: number;
    borrowAPY: number;
    totalSupply: number;
    totalBorrow: number;
    lltv: number;
    availableLiquidity: number;
    utilization: number;
    paused: boolean;
}

function formatNumber(num: number, decimals: number = 2): string {
    if (num >= 1_000_000) {
        return `${(num / 1_000_000).toFixed(decimals)}M`;
    } else if (num >= 1_000) {
        return `${(num / 1_000).toFixed(decimals)}K`;
    }
    return num.toFixed(decimals);
}

interface MarketCardProps {
    market: Market;
}

export function MarketCard({ market }: MarketCardProps) {
    return (
        <Link href={`/markets/${market.id}`}>
            <Card className="cursor-pointer hover:shadow-lg transition-all hover:border-indigo-500/50 h-full">
                <CardHeader>
                    <div className="flex justify-between items-start">
                        <div>
                            <CardTitle className="text-xl flex items-center gap-2">
                                <div className="flex -space-x-2">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-xs font-bold border-2 border-background">
                                        {market.collateralSymbol[0]}
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold border-2 border-background">
                                        {market.loanSymbol[0]}
                                    </div>
                                </div>
                                {market.collateralSymbol} / {market.loanSymbol}
                            </CardTitle>
                            <CardDescription className="mt-1">
                                LLTV: {(market.lltv / 100).toFixed(0)}%
                            </CardDescription>
                        </div>
                        {market.paused && (
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
                                Supply APY
                            </p>
                            <p className="text-lg font-bold text-green-600">
                                {market.supplyAPY.toFixed(2)}%
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <TrendingDown className="w-3 h-3" />
                                Borrow APY
                            </p>
                            <p className="text-lg font-bold text-orange-600">
                                {market.borrowAPY.toFixed(2)}%
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Total Supply</p>
                            <p className="text-lg font-semibold">${formatNumber(market.totalSupply)}</p>
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground">Total Borrow</p>
                            <p className="text-lg font-semibold">${formatNumber(market.totalBorrow)}</p>
                        </div>
                    </div>

                    <div className="mt-4">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                            <span>Utilization</span>
                            <span>{market.utilization.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 bg-secondary rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all"
                                style={{ width: `${market.utilization}%` }}
                            />
                        </div>
                    </div>

                    <div className="mt-3 text-xs text-muted-foreground">
                        Available: ${formatNumber(market.availableLiquidity)}
                    </div>
                </CardContent>
            </Card>
        </Link>
    );
}
