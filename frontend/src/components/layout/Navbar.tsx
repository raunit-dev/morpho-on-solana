"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { cn } from "@/lib/utils";

const navItems = [
    { name: "Markets", href: "/markets" },
    { name: "Lend", href: "/lend" },
    { name: "Borrow", href: "/borrow" },
    { name: "Portfolio", href: "/portfolio" },
];

export function Navbar() {
    const pathname = usePathname();
    const { connected } = useWallet();

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
                        <span className={cn(
                            "w-2 h-2 rounded-full mr-2",
                            connected ? "bg-green-500" : "bg-orange-500"
                        )}></span>
                        Devnet
                    </div>

                    <WalletMultiButton style={{
                        backgroundColor: 'hsl(var(--primary))',
                        borderRadius: '0.5rem',
                        fontSize: '0.875rem',
                        height: '2.5rem',
                    }} />
                </div>
            </div>
        </nav>
    );
}
