'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletButton } from '@/components/wallet/WalletButton';
import { cn } from '@/lib/utils';
import {
    BarChart3,
    Wallet,
    Zap,
    Settings,
    TrendingDown,
    Shield,
} from 'lucide-react';

const navItems = [
    { name: 'Markets', href: '/markets', icon: BarChart3 },
    { name: 'Dashboard', href: '/dashboard', icon: Wallet },
    { name: 'Liquidations', href: '/liquidations', icon: TrendingDown },
    { name: 'Flash Loans', href: '/flash-loans', icon: Zap },
    { name: 'Admin', href: '/admin', icon: Shield },
];

export function Header() {
    const pathname = usePathname();

    return (
        <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex h-16 items-center justify-between">
                <div className="flex items-center gap-8">
                    <Link href="/" className="flex items-center gap-2 font-bold text-xl">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold">
                            M
                        </div>
                        <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                            Morpho Blue
                        </span>
                    </Link>

                    <nav className="hidden md:flex gap-6">
                        {navItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = pathname.startsWith(item.href);

                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                        'flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary',
                                        isActive ? 'text-foreground' : 'text-muted-foreground'
                                    )}
                                >
                                    <Icon className="h-4 w-4" />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                <WalletButton />
            </div>
        </header>
    );
}
