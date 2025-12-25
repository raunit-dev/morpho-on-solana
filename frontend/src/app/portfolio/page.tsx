"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/lib/mock-wallet";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const chartData = [
    { name: 'Mon', value: 4000 },
    { name: 'Tue', value: 3000 },
    { name: 'Wed', value: 5000 },
    { name: 'Thu', value: 4500 },
    { name: 'Fri', value: 6000 },
    { name: 'Sat', value: 5500 },
    { name: 'Sun', value: 7000 },
];

export default function PortfolioPage() {
    const { connected, connect } = useWallet();

    if (!connected) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
                <div className="p-4 rounded-full bg-secondary">
                    <Wallet className="h-12 w-12 text-muted-foreground" />
                </div>
                <h1 className="text-2xl font-bold">Connect Wallet</h1>
                <p className="text-muted-foreground max-w-sm">
                    Connect your wallet to view your positions, rewards, and transaction history.
                </p>
                <Button onClick={connect} size="lg">Connect Wallet</Button>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Portfolio</h1>
                <p className="text-muted-foreground mt-2">
                    Track all your Morpho positions in one place.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-4">
                <Card className="bg-primary text-primary-foreground">
                    <CardHeader className="pb-2">
                        <CardDescription className="text-primary-foreground/70">Net Value</CardDescription>
                        <CardTitle className="text-3xl font-mono">$7,123.45</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Fees & Interest</CardDescription>
                        <CardTitle className="text-2xl font-mono text-green-600">+$123.50</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Claimable Rewards</CardDescription>
                        <CardTitle className="text-2xl font-mono">$45.20</CardTitle>
                    </CardHeader>
                </Card>
                <Card>
                    <CardHeader className="pb-2">
                        <CardDescription>Season 5 Points</CardDescription>
                        <CardTitle className="text-2xl font-mono">1,250</CardTitle>
                    </CardHeader>
                </Card>
            </div>

            <Card className="h-[300px]">
                <CardHeader>
                    <CardTitle>Portfolio Net Value</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} />
                            <YAxis axisLine={false} tickLine={false} />
                            <Tooltip />
                            <Area type="monotone" dataKey="value" stroke="#6366F1" fillOpacity={1} fill="url(#colorValue)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Tabs defaultValue="lend" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="lend">Lend (2)</TabsTrigger>
                    <TabsTrigger value="borrow">Borrow (1)</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>

                <TabsContent value="lend">
                    <Card>
                        <CardHeader>
                            <CardTitle>Supply Positions</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Market</TableHead>
                                        <TableHead>Net Value</TableHead>
                                        <TableHead>Pending Rewards</TableHead>
                                        <TableHead>Net APY</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell className="font-medium">USDC Prime</TableCell>
                                        <TableCell>$5,000.00</TableCell>
                                        <TableCell>$12.50</TableCell>
                                        <TableCell className="text-green-600">5.24%</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell className="font-medium">SOL Prime</TableCell>
                                        <TableCell>$2,123.45</TableCell>
                                        <TableCell>$32.70</TableCell>
                                        <TableCell className="text-green-600">4.85%</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="borrow">
                    <Card>
                        <CardHeader>
                            <CardTitle>Borrow Positions</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Market</TableHead>
                                        <TableHead>Net Value</TableHead>
                                        <TableHead>Debt</TableHead>
                                        <TableHead>Collateral</TableHead>
                                        <TableHead>LTV</TableHead>
                                        <TableHead>Net APY</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    <TableRow>
                                        <TableCell className="font-medium">USDC / SOL</TableCell>
                                        <TableCell>$500.00</TableCell>
                                        <TableCell>$1,000.00</TableCell>
                                        <TableCell>$1,500.00</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="border-green-500 text-green-600">
                                                66%
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-red-500">6.82%</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
