import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/layout/Navbar";
import { WalletContextProvider } from "@/lib/wallet-adapter";
import { Toaster } from "@/components/ui/sonner";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Morpho Blue Solana",
  description: "Isolated lending markets on Solana",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        <WalletContextProvider>
          <div className="relative flex min-h-screen flex-col">
            <Navbar />
            <main className="flex-1 container py-8">
              {children}
            </main>
            <Toaster />
          </div>
        </WalletContextProvider>
      </body>
    </html>
  );
}
