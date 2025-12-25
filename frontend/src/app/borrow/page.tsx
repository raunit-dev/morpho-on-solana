import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { BorrowModal } from "@/components/modals/BorrowModal";

// Mock data
const borrowMarkets = [
    {
        id: "1",
        asset: "USDC",
        collateral: "SOL",
        totalSupply: 54000000,
        totalBorrow: 23500000,
        liquidationLtv: 90,
        supplyApy: 5.23,
        borrowApy: 6.82,
    },
    {
        id: "2",
        asset: "SOL",
        collateral: "USDC",
        totalSupply: 45000000,
        totalBorrow: 35000000,
        liquidationLtv: 75,
        supplyApy: 4.12,
        borrowApy: 4.96,
    },
    {
        id: "3",
        asset: "PYUSD",
        collateral: "ETH",
        totalSupply: 27000000,
        totalBorrow: 15400000,
        liquidationLtv: 90,
        supplyApy: 8.50,
        borrowApy: 9.63,
    },
];

export default function BorrowPage() {
    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Borrow</h1>
                <p className="text-muted-foreground mt-2">
                    Securely borrow assets against your collateral.
                </p>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Borrow Markets</CardTitle>
                    <CardDescription>
                        High LTV loans with isolated risk.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Asset</TableHead>
                                <TableHead>Collateral</TableHead>
                                <TableHead>Available</TableHead>
                                <TableHead>Liq. LTV</TableHead>
                                <TableHead>Supply APY</TableHead>
                                <TableHead>Borrow APY</TableHead>
                                <TableHead className="text-right">Action</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {borrowMarkets.map((market) => (
                                <TableRow key={market.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-2">
                                            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-xs text-white">
                                                {market.asset[0]}
                                            </div>
                                            <span className="font-medium">{market.asset}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="gap-1">
                                            <div className="w-2 h-2 rounded-full bg-primary"></div>
                                            {market.collateral}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        ${(market.totalSupply / 1000000).toFixed(1)}M
                                    </TableCell>
                                    <TableCell>
                                        {market.liquidationLtv}%
                                    </TableCell>
                                    <TableCell className="text-green-600">
                                        {market.supplyApy}%
                                    </TableCell>
                                    <TableCell className="text-red-500 font-medium">
                                        {market.borrowApy}%
                                    </TableCell>
                                    <TableCell className="text-right flex justify-end gap-2">
                                        <Button variant="ghost" className="text-green-600 hover:text-green-700 hover:bg-green-50">
                                            Supply
                                        </Button>
                                        <BorrowModal
                                            marketId={market.id}
                                            tokenSymbol={market.asset}
                                            collateralSymbol={market.collateral}
                                            lltv={market.liquidationLtv}
                                            borrowApy={market.borrowApy}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {["Total Market Size", "Active Borrows", "Total Collateral", "Protocol Revenue"].map((label, i) => (
                    <Card key={label} className="bg-muted/50 border-none">
                        <CardHeader className="pb-2">
                            <CardDescription>{label}</CardDescription>
                            <CardTitle className="text-2xl">${(100 + i * 50).toFixed(2)}M</CardTitle>
                        </CardHeader>
                    </Card>
                ))}
            </div>
        </div>
    );
}
