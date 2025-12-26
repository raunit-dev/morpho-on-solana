import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { WalletContextProvider } from '@/components/wallet/WalletProvider';
import { Header } from '@/components/layout/Header';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Morpho Blue Solana',
  description: 'Isolated lending markets on Solana - Supply, Borrow, and Earn',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased min-h-screen bg-background text-foreground`}>
        <WalletContextProvider>
          <div className="relative flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">
              {children}
            </main>
            <footer className="border-t py-6 md:py-0">
              <div className="container flex h-14 items-center justify-between text-sm text-muted-foreground">
                <span>© 2024 Morpho Blue Solana</span>
                <span>Deployed on Devnet</span>
              </div>
            </footer>
          </div>
          <Toaster />
        </WalletContextProvider>
      </body>
    </html>
  );
}
