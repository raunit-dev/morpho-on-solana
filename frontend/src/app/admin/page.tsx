'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useProtocolState, useMarkets, useIsAdmin } from '@/lib/hooks/useOnChainData';
import { useState } from 'react';
import {
    Shield,
    AlertTriangle,
    CheckCircle,
    Lock,
    Unlock,
    Settings,
    DollarSign,
    Users,
    Pause,
    Play,
    ArrowRight,
    AlertCircle,
} from 'lucide-react';

function formatNumber(num: number): string {
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
}

function ProtocolNotInitialized() {
    return (
        <div className="container py-16">
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                <div className="p-4 rounded-full bg-yellow-100 dark:bg-yellow-900">
                    <AlertCircle className="h-12 w-12 text-yellow-600" />
                </div>
                <h1 className="text-3xl font-bold">Protocol Not Initialized</h1>
                <p className="text-muted-foreground max-w-md">
                    The protocol has not been initialized yet. Use the <code className="bg-secondary px-2 py-1 rounded">initialize()</code> instruction to set up the protocol.
                </p>
            </div>
        </div>
    );
}

export default function AdminPage() {
    const { connected, publicKey } = useWallet();
    const { data: protocolState, isLoading: protocolLoading } = useProtocolState();
    const { data: markets, isLoading: marketsLoading } = useMarkets();
    const isAdmin = useIsAdmin();

    const [newOwner, setNewOwner] = useState('');
    const [newFeeRecipient, setNewFeeRecipient] = useState('');
    const [newLltv, setNewLltv] = useState('');
    const [newIrm, setNewIrm] = useState('');
    const [selectedMarketFee, setSelectedMarketFee] = useState('');

    if (!connected) {
        return (
            <div className="container py-16">
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                    <div className="p-4 rounded-full bg-secondary">
                        <Lock className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <h1 className="text-3xl font-bold">Admin Access Required</h1>
                    <p className="text-muted-foreground max-w-md">
                        Connect your wallet to access the admin panel. Only the protocol owner can manage settings.
                    </p>
                    <WalletMultiButton />
                </div>
            </div>
        );
    }

    if (protocolLoading) {
        return (
            <div className="container py-8">
                <div className="space-y-6">
                    <Skeleton className="h-12 w-64" />
                    <div className="grid md:grid-cols-2 gap-6">
                        <Skeleton className="h-64" />
                        <Skeleton className="h-64" />
                    </div>
                </div>
            </div>
        );
    }

    if (!protocolState) {
        return <ProtocolNotInitialized />;
    }

    if (isAdmin === false) {
        return (
            <div className="container py-16">
                <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
                    <div className="p-4 rounded-full bg-red-100 dark:bg-red-900">
                        <AlertTriangle className="h-12 w-12 text-red-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-red-600">Access Denied</h1>
                    <p className="text-muted-foreground max-w-md">
                        Your wallet is not the protocol owner. Only the owner can access this page.
                    </p>
                    <div className="text-sm font-mono bg-secondary px-4 py-2 rounded">
                        Owner: {protocolState.owner.toString().slice(0, 8)}...{protocolState.owner.toString().slice(-8)}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="container py-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                        <Shield className="w-8 h-8 text-indigo-600" />
                        Admin Panel
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        Manage protocol settings, markets, and whitelists
                    </p>
                </div>
                <Badge variant="default" className="px-4 py-2 bg-green-600">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Owner Access
                </Badge>
            </div>

            <Tabs defaultValue="protocol" className="space-y-8">
                <TabsList className="w-full justify-start">
                    <TabsTrigger value="protocol">Protocol</TabsTrigger>
                    <TabsTrigger value="markets">Markets</TabsTrigger>
                    <TabsTrigger value="whitelist">Whitelist</TabsTrigger>
                </TabsList>

                {/* Protocol Tab */}
                <TabsContent value="protocol" className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Ownership */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Users className="w-5 h-5" />
                                    Ownership Management
                                </CardTitle>
                                <CardDescription>
                                    Instructions: transfer_ownership(), accept_ownership()
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Current Owner</span>
                                        <span className="font-mono text-xs">{protocolState.owner.toString().slice(0, 12)}...</span>
                                    </div>
                                    {protocolState.pendingOwner && (
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Pending Owner</span>
                                            <span className="font-mono text-orange-600 text-xs">{protocolState.pendingOwner.toString().slice(0, 12)}...</span>
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <label className="text-sm font-medium">Transfer Ownership To</label>
                                    <Input
                                        value={newOwner}
                                        onChange={(e) => setNewOwner(e.target.value)}
                                        placeholder="Enter new owner address"
                                        className="mt-1"
                                    />
                                </div>

                                <Alert>
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Two-Step Transfer</AlertTitle>
                                    <AlertDescription>
                                        New owner must call accept_ownership() to complete transfer.
                                    </AlertDescription>
                                </Alert>

                                <Button className="w-full" disabled={!newOwner}>
                                    <ArrowRight className="w-4 h-4 mr-2" />
                                    Transfer Ownership
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Fee Recipient */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <DollarSign className="w-5 h-5" />
                                    Fee Recipient
                                </CardTitle>
                                <CardDescription>
                                    Instruction: set_fee_recipient()
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex justify-between text-sm">
                                    <span className="text-muted-foreground">Current Recipient</span>
                                    <span className="font-mono text-xs">{protocolState.feeRecipient.toString().slice(0, 12)}...</span>
                                </div>

                                <div>
                                    <label className="text-sm font-medium">New Fee Recipient</label>
                                    <Input
                                        value={newFeeRecipient}
                                        onChange={(e) => setNewFeeRecipient(e.target.value)}
                                        placeholder="Enter new fee recipient address"
                                        className="mt-1"
                                    />
                                </div>

                                <Button className="w-full" variant="outline" disabled={!newFeeRecipient}>
                                    <Settings className="w-4 h-4 mr-2" />
                                    Update Fee Recipient
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Protocol Pause */}
                        <Card className="md:col-span-2">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    {protocolState.paused ? <Pause className="w-5 h-5 text-red-500" /> : <Play className="w-5 h-5 text-green-500" />}
                                    Protocol Emergency Pause
                                </CardTitle>
                                <CardDescription>
                                    Instruction: set_protocol_paused()
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">Protocol Status</p>
                                        <p className="text-sm text-muted-foreground">
                                            {protocolState.paused
                                                ? 'Protocol is PAUSED. All operations are blocked.'
                                                : 'Protocol is ACTIVE. All operations are allowed.'}
                                        </p>
                                    </div>
                                    <Button variant={protocolState.paused ? 'default' : 'destructive'}>
                                        {protocolState.paused ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                                        {protocolState.paused ? 'Unpause Protocol' : 'Pause Protocol'}
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* Markets Tab */}
                <TabsContent value="markets" className="space-y-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Market Management</CardTitle>
                            <CardDescription>
                                Instructions: set_market_paused(), set_fee(), claim_fees()
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {marketsLoading ? (
                                <div className="space-y-4">
                                    <Skeleton className="h-12 w-full" />
                                    <Skeleton className="h-12 w-full" />
                                </div>
                            ) : markets && markets.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Market</TableHead>
                                            <TableHead>Fee (BPS)</TableHead>
                                            <TableHead>Total Supply</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {markets.map((market) => (
                                            <TableRow key={market.publicKey.toString()}>
                                                <TableCell className="font-mono text-xs">{market.publicKey.toString().slice(0, 12)}...</TableCell>
                                                <TableCell>{(market.account.fee / 100).toFixed(2)}%</TableCell>
                                                <TableCell className="text-green-600 font-semibold">
                                                    {formatNumber(Number(market.account.totalSupplyAssets) / 1e6)}
                                                </TableCell>
                                                <TableCell>
                                                    {market.account.paused ? (
                                                        <Badge variant="destructive"><Lock className="w-3 h-3 mr-1" />Paused</Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-green-600"><Unlock className="w-3 h-3 mr-1" />Active</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex gap-2">
                                                        <Button size="sm" variant={market.account.paused ? 'default' : 'outline'}>
                                                            {market.account.paused ? 'Unpause' : 'Pause'}
                                                        </Button>
                                                        <Button size="sm" variant="outline">
                                                            <DollarSign className="w-3 h-3 mr-1" />
                                                            Claim
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                    <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p>No markets have been created yet</p>
                                    <p className="text-sm mt-2">Use create_market() to create the first market</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Whitelist Tab */}
                <TabsContent value="whitelist" className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                        {/* LLTV Whitelist */}
                        <Card>
                            <CardHeader>
                                <CardTitle>LLTV Whitelist</CardTitle>
                                <CardDescription>
                                    Instruction: enable_lltv()
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="text-sm text-muted-foreground">
                                    Enabled LLTVs are stored on-chain. Query the protocol to see current values.
                                </div>

                                <div>
                                    <label className="text-sm font-medium">Add New LLTV (BPS, e.g., 8500 = 85%)</label>
                                    <div className="flex gap-2 mt-1">
                                        <Input
                                            type="number"
                                            value={newLltv}
                                            onChange={(e) => setNewLltv(e.target.value)}
                                            placeholder="e.g., 8500"
                                        />
                                        <Button disabled={!newLltv}>
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                            Enable
                                        </Button>
                                    </div>
                                </div>

                                <Alert>
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Note</AlertTitle>
                                    <AlertDescription>
                                        LLTVs cannot be disabled once enabled. Max 10 LLTVs allowed.
                                    </AlertDescription>
                                </Alert>
                            </CardContent>
                        </Card>

                        {/* IRM Whitelist */}
                        <Card>
                            <CardHeader>
                                <CardTitle>IRM Whitelist</CardTitle>
                                <CardDescription>
                                    Instruction: enable_irm()
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="text-sm text-muted-foreground">
                                    Enabled IRMs are stored on-chain. Query the protocol to see current values.
                                </div>

                                <div>
                                    <label className="text-sm font-medium">Add New IRM Address</label>
                                    <div className="flex gap-2 mt-1">
                                        <Input
                                            value={newIrm}
                                            onChange={(e) => setNewIrm(e.target.value)}
                                            placeholder="Enter IRM account address"
                                        />
                                        <Button disabled={!newIrm}>
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                            Enable
                                        </Button>
                                    </div>
                                </div>

                                <Alert>
                                    <AlertTriangle className="h-4 w-4" />
                                    <AlertTitle>Note</AlertTitle>
                                    <AlertDescription>
                                        IRMs cannot be disabled once enabled. Max 5 IRMs allowed.
                                    </AlertDescription>
                                </Alert>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
