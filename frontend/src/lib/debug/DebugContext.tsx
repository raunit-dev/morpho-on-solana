'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface DebugLogEntry {
    id: string;
    timestamp: Date;
    instruction: string;
    status: 'pending' | 'success' | 'error';
    params: Record<string, unknown>;
    accounts: Record<string, string>;
    signature?: string;
    error?: string;
    duration?: number;
}

interface DebugContextType {
    logs: DebugLogEntry[];
    addLog: (entry: Omit<DebugLogEntry, 'id' | 'timestamp'>) => string;
    updateLog: (id: string, updates: Partial<DebugLogEntry>) => void;
    clearLogs: () => void;
    isOpen: boolean;
    togglePanel: () => void;
}

const DebugContext = createContext<DebugContextType | null>(null);

export function useDebug() {
    const context = useContext(DebugContext);
    if (!context) {
        throw new Error('useDebug must be used within DebugProvider');
    }
    return context;
}

export function DebugProvider({ children }: { children: ReactNode }) {
    const [logs, setLogs] = useState<DebugLogEntry[]>([]);
    const [isOpen, setIsOpen] = useState(false);

    const addLog = useCallback((entry: Omit<DebugLogEntry, 'id' | 'timestamp'>) => {
        const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newEntry: DebugLogEntry = {
            ...entry,
            id,
            timestamp: new Date(),
        };
        setLogs(prev => [newEntry, ...prev].slice(0, 50)); // Keep last 50 logs
        return id;
    }, []);

    const updateLog = useCallback((id: string, updates: Partial<DebugLogEntry>) => {
        setLogs(prev => prev.map(log =>
            log.id === id ? { ...log, ...updates } : log
        ));
    }, []);

    const clearLogs = useCallback(() => {
        setLogs([]);
    }, []);

    const togglePanel = useCallback(() => {
        setIsOpen(prev => !prev);
    }, []);

    return (
        <DebugContext.Provider value={{ logs, addLog, updateLog, clearLogs, isOpen, togglePanel }}>
            {children}
        </DebugContext.Provider>
    );
}
