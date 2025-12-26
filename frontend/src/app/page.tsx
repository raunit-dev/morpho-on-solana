'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useMarkets } from '@/lib/hooks/useOnChainData';
import {
  TrendingUp,
  Shield,
  Zap,
  BarChart3,
  ArrowRight,
  CheckCircle,
} from 'lucide-react';

function formatNumber(num: number): string {
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
}

export default function HomePage() {
  const { connected } = useWallet();
  const { data: markets, isLoading } = useMarkets();

  // Calculate real stats
  const totalTVL = markets?.reduce((acc, m) => acc + Number(m.account.totalSupplyAssets) / 1e6, 0) || 0;
  const activeMarkets = markets?.filter(m => !m.account.paused).length || 0;

  return (
    <div className="container py-12">
      {/* Hero Section */}
      <section className="text-center py-16 space-y-6">
        <Badge variant="outline" className="px-4 py-1 text-sm">
          <CheckCircle className="w-3 h-3 mr-2 text-green-500" />
          Live on Solana Devnet
        </Badge>

        <h1 className="text-5xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Morpho Blue
          </span>{' '}
          Lending Protocol
        </h1>

        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          The most efficient isolated lending markets on Solana. Supply assets to earn yield,
          borrow against collateral, or provide liquidity for flash loans.
        </p>

        <div className="flex justify-center gap-4 pt-4">
          {connected ? (
            <Button asChild size="lg">
              <Link href="/markets">
                Explore Markets
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <WalletMultiButton style={{
              backgroundColor: '#6366F1',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              height: '3rem',
              padding: '0 2rem',
            }} />
          )}
          <Button variant="outline" size="lg" asChild>
            <Link href="/dashboard">View Dashboard</Link>
          </Button>
        </div>
      </section>

      {/* Features Grid */}
      <section className="grid md:grid-cols-3 gap-6 py-12">
        <Card className="border-2 hover:border-indigo-500/50 transition-colors">
          <CardHeader>
            <div className="h-12 w-12 rounded-lg bg-green-500/10 flex items-center justify-center mb-4">
              <TrendingUp className="h-6 w-6 text-green-500" />
            </div>
            <CardTitle>Supply & Earn</CardTitle>
            <CardDescription>
              Deposit assets into isolated markets and earn competitive APY. Full control over your positions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                ERC-4626 share accounting
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Compound interest accrual
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Withdraw anytime
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-2 hover:border-orange-500/50 transition-colors">
          <CardHeader>
            <div className="h-12 w-12 rounded-lg bg-orange-500/10 flex items-center justify-center mb-4">
              <Shield className="h-6 w-6 text-orange-500" />
            </div>
            <CardTitle>Borrow Safely</CardTitle>
            <CardDescription>
              Deposit collateral and borrow against it. Health factor monitoring prevents liquidations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Real-time health factor
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Oracle-based pricing
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Graceful liquidation
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-2 hover:border-purple-500/50 transition-colors">
          <CardHeader>
            <div className="h-12 w-12 rounded-lg bg-purple-500/10 flex items-center justify-center mb-4">
              <Zap className="h-6 w-6 text-purple-500" />
            </div>
            <CardTitle>Flash Loans</CardTitle>
            <CardDescription>
              Borrow any amount without collateral within a single transaction. Perfect for arbitrage.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                No collateral required
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                0.05% flash fee
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Atomic execution
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Stats Section */}
      <section className="py-12 border-y">
        <div className="grid md:grid-cols-4 gap-8 text-center">
          <div>
            {isLoading ? (
              <Skeleton className="h-9 w-24 mx-auto" />
            ) : (
              <div className="text-3xl font-bold">{formatNumber(totalTVL)}</div>
            )}
            <div className="text-muted-foreground">Total Value Locked</div>
          </div>
          <div>
            {isLoading ? (
              <Skeleton className="h-9 w-12 mx-auto" />
            ) : (
              <div className="text-3xl font-bold">{activeMarkets}</div>
            )}
            <div className="text-muted-foreground">Active Markets</div>
          </div>
          <div>
            <div className="text-3xl font-bold">--</div>
            <div className="text-muted-foreground">Avg Supply APY</div>
          </div>
          <div>
            <div className="text-3xl font-bold">26</div>
            <div className="text-muted-foreground">Protocol Instructions</div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="text-center py-16">
        <h2 className="text-3xl font-bold mb-4">Ready to start lending?</h2>
        <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
          Connect your wallet and explore the available markets. All transactions are on Solana Devnet.
        </p>
        <Button asChild size="lg">
          <Link href="/markets">
            <BarChart3 className="mr-2 h-5 w-5" />
            View All Markets
          </Link>
        </Button>
      </section>
    </div>
  );
}
