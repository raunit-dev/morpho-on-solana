import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

// Mock data
const markets = [
    {
        id: "1",
        collateral: "SOL",
        loan: "USDC",
        totalSupply: 15400000,
        totalBorrow: 8200000,
        supplyApy: 5.24,
        borrowApy: 6.82,
        lltv: 85,
    },
    {
        id: "2",
        collateral: "BTC",
        loan: "USDC",
        totalSupply: 8500000,
        totalBorrow: 2100000,
        supplyApy: 3.12,
        borrowApy: 4.50,
        lltv: 80,
    },
    {
        id: "3",
        collateral: "ETH",
        loan: "SOL",
        totalSupply: 420000,
        totalBorrow: 150000,
        supplyApy: 4.85,
        borrowApy: 5.90,
        lltv: 85,
    },
];

export default function MarketsPage() {
    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Markets</h1>
                    <p className="text-muted-foreground mt-2">
                        Explore isolated lending markets on Solana.
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>All Markets</CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Market Pair</TableHead>
                                <TableHead>Total Supply</TableHead>
                                <TableHead>Total Borrow</TableHead>
                                <TableHead>Utilization</TableHead>
                                <TableHead>Supply APY</TableHead>
                                <TableHead>Borrow APY</TableHead>
                                <TableHead>LLTV</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {markets.map((market) => (
                                <TableRow key={market.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="flex -space-x-2">
                                                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs text-white border-2 border-background">
                                                    {market.collateral[0]}
                                                </div>
                                                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs text-white border-2 border-background">
                                                    {market.loan[0]}
                                                </div>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{market.collateral}/{market.loan}</span>
                                                <span className="text-xs text-muted-foreground">Morpho Blue</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        ${(market.totalSupply / 1000000).toFixed(1)}M
                                    </TableCell>
                                    <TableCell>
                                        ${(market.totalBorrow / 1000000).toFixed(1)}M
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="secondary">
                                            {((market.totalBorrow / market.totalSupply) * 100).toFixed(1)}%
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-green-600 font-medium">
                                        {market.supplyApy}%
                                    </TableCell>
                                    <TableCell>
                                        {market.borrowApy}%
                                    </TableCell>
                                    <TableCell>
                                        {market.lltv}%
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm" asChild>
                                            <Link href={`/market/${market.id}`}>
                                                Details <ArrowUpRight className="ml-2 h-4 w-4" />
                                            </Link>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
