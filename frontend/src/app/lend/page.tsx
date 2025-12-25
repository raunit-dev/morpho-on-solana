import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SupplyModal } from "@/components/modals/SupplyModal";
import { TrendingUp, ShieldCheck } from "lucide-react";

// Mock data
const lendMarkets = [
    {
        id: "1",
        asset: "USDC",
        protocol: "Morpho Blue",
        apy: 5.24,
        deposits: 15400000,
        profile: "Balanced",
        riskScore: 92,
    },
    {
        id: "2",
        asset: "SOL",
        protocol: "Morpho Blue",
        apy: 4.85,
        deposits: 8500000,
        profile: "Conservative",
        riskScore: 98,
    },
    {
        id: "3",
        asset: "PYUSD",
        protocol: "Morpho Blue",
        apy: 9.63,
        deposits: 2100000,
        profile: "Aggressive",
        riskScore: 85,
    },
];

export default function LendPage() {
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Lend</h1>
                <p className="text-muted-foreground mt-2">
                    Earn automated yield on your assets.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
                {lendMarkets.map((market) => (
                    <Card key={market.id} className="bg-gradient-to-br from-card to-secondary/50">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">
                                {market.asset} Prime
                            </CardTitle>
                            <Badge variant="outline">{market.profile}</Badge>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-primary flex items-center gap-2">
                                +{market.apy}% <TrendingUp className="h-4 w-4" />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                ${(market.deposits / 1000000).toFixed(1)}M TVL
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Vaults</CardTitle>
                    <CardDescription>
                        Supply liquidity to isolated lending markets.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Vault</TableHead>
                                <TableHead>APY</TableHead>
                                <TableHead>Deposits</TableHead>
                                <TableHead>Vault Profile</TableHead>
                                <TableHead>Safety Score</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {lendMarkets.map((market) => (
                                <TableRow key={market.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs text-white">
                                                {market.asset[0]}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{market.asset}</span>
                                                <span className="text-xs text-muted-foreground">{market.protocol}</span>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-green-600 font-bold">
                                        {market.apy}%
                                    </TableCell>
                                    <TableCell>
                                        ${(market.deposits / 1000000).toFixed(2)}M
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={
                                            market.profile === "Conservative" ? "secondary" :
                                                market.profile === "Aggressive" ? "destructive" : "outline"
                                        }>
                                            {market.profile}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1 text-green-600">
                                            <ShieldCheck className="h-4 w-4" />
                                            {market.riskScore}/100
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <SupplyModal
                                            marketId={market.id}
                                            tokenSymbol={market.asset}
                                            apy={market.apy}
                                        />
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
