'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Badge } from '@/components/ui/badge';
import { CheckCircle } from 'lucide-react';

export function WalletButton() {
    const { connected } = useWallet();

    return (
        <div className="flex items-center gap-2">
            {connected && (
                <Badge variant="outline" className="text-green-600 border-green-600">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Devnet
                </Badge>
            )}
            <WalletMultiButton style={{
                backgroundColor: connected ? '#10B981' : '#6366F1',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                height: '2.5rem',
                padding: '0 1rem',
            }} />
        </div>
    );
}
