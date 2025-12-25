"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { toast } from "sonner";

interface WalletContextType {
    connected: boolean;
    publicKey: string | null;
    connect: () => void;
    disconnect: () => void;
    balance: number;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: React.ReactNode }) {
    const [connected, setConnected] = useState(false);
    const [publicKey, setPublicKey] = useState<string | null>(null);
    const [balance, setBalance] = useState(0);

    // Load state from local storage on mount
    useEffect(() => {
        const savedState = localStorage.getItem("morpho-wallet-connected");
        if (savedState === "true") {
            setConnected(true);
            setPublicKey("Morpho...Wallet");
            setBalance(145.23); // Mock balance
        }
    }, []);

    const connect = () => {
        // Simulate connection delay
        setTimeout(() => {
            setConnected(true);
            setPublicKey("Morpho...Wallet");
            setBalance(145.23);
            localStorage.setItem("morpho-wallet-connected", "true");
            toast.success("Wallet Connected", {
                description: "Connected to Mock Wallet"
            });
        }, 500);
    };

    const disconnect = () => {
        setConnected(false);
        setPublicKey(null);
        setBalance(0);
        localStorage.removeItem("morpho-wallet-connected");
        toast.message("Wallet Disconnected");
    };

    return (
        <WalletContext.Provider value={{ connected, publicKey, connect, disconnect, balance }}>
            {children}
        </WalletContext.Provider>
    );
}

export function useWallet() {
    const context = useContext(WalletContext);
    if (context === undefined) {
        throw new Error("useWallet must be used within a WalletProvider");
    }
    return context;
}
