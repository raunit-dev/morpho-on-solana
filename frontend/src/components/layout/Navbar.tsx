"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/mock-wallet";
import { cn } from "@/lib/utils";
import { Copy, LogOut, Wallet } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const navItems = [
    { name: "Markets", href: "/markets" },
    { name: "Lend", href: "/lend" },
    { name: "Borrow", href: "/borrow" },
    { name: "Portfolio", href: "/portfolio" },
];

export function Navbar() {
    const pathname = usePathname();
    const { connected, publicKey, connect, disconnect, balance } = useWallet();

    return (
        <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
            <div className="container flex h-16 items-center justify-between">
                <div className="flex items-center gap-8">
                    <Link href="/" className="flex items-center gap-2 font-bold text-xl text-primary">
                        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                            M
                        </div>
                        Morpho Blue
                    </Link>

                    <div className="hidden md:flex gap-6">
                        {navItems.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={cn(
                                    "text-sm font-medium transition-colors hover:text-primary",
                                    pathname === item.href
                                        ? "text-foreground"
                                        : "text-muted-foreground"
                                )}
                            >
                                {item.name}
                            </Link>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center text-sm font-medium text-muted-foreground border rounded-full px-3 py-1">
                        <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                        Devnet
                    </div>

                    {connected ? (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" className="gap-2">
                                    <Wallet className="h-4 w-4" />
                                    {publicKey}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56">
                                <DropdownMenuLabel>My Wallet</DropdownMenuLabel>
                                <div className="px-2 py-1.5 text-sm font-medium text-muted-foreground">
                                    Balance: {balance.toFixed(2)} SOL
                                </div>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => navigator.clipboard.writeText("MockPublicKey123")}>
                                    <Copy className="mr-2 h-4 w-4" />
                                    Copy Address
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={disconnect} className="text-destructive focus:text-destructive">
                                    <LogOut className="mr-2 h-4 w-4" />
                                    Disconnect
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ) : (
                        <Button onClick={connect} className="gap-2">
                            <Wallet className="h-4 w-4" />
                            Connect Wallet
                        </Button>
                    )}
                </div>
            </div>
        </nav>
    );
}
