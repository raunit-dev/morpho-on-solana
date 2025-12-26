'use client';

import { useDebug } from '@/lib/debug/DebugContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
    Bug,
    X,
    Trash2,
    CheckCircle,
    XCircle,
    Loader2,
    ExternalLink,
    ChevronDown,
    ChevronRight,
} from 'lucide-react';
import { useState } from 'react';

function LogEntry({ log }: { log: import('@/lib/debug/DebugContext').DebugLogEntry }) {
    const [expanded, setExpanded] = useState(false);

    const statusIcon = {
        pending: <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />,
        success: <CheckCircle className="w-4 h-4 text-green-500" />,
        error: <XCircle className="w-4 h-4 text-red-500" />,
    }[log.status];

    const statusBadge = {
        pending: <Badge variant="outline" className="text-yellow-600 border-yellow-600">Pending</Badge>,
        success: <Badge variant="outline" className="text-green-600 border-green-600">Success</Badge>,
        error: <Badge variant="destructive">Error</Badge>,
    }[log.status];

    return (
        <div className="border rounded-lg p-3 bg-card text-card-foreground">
            <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => setExpanded(!expanded)}
            >
                {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                {statusIcon}
                <span className="font-mono font-semibold text-sm">{log.instruction}</span>
                {statusBadge}
                <span className="text-xs text-muted-foreground ml-auto">
                    {log.timestamp.toLocaleTimeString()}
                </span>
            </div>

            {expanded && (
                <div className="mt-3 space-y-3 text-xs">
                    {log.duration && (
                        <div>
                            <span className="text-muted-foreground">Duration: </span>
                            <span className="font-mono">{log.duration}ms</span>
                        </div>
                    )}

                    {log.signature && (
                        <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">Signature: </span>
                            <code className="font-mono bg-secondary px-2 py-1 rounded text-xs">
                                {log.signature.slice(0, 20)}...{log.signature.slice(-8)}
                            </code>
                            <a
                                href={`https://explorer.solana.com/tx/${log.signature}?cluster=devnet`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 hover:underline"
                            >
                                <ExternalLink className="w-3 h-3" />
                            </a>
                        </div>
                    )}

                    {log.error && (
                        <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded p-2">
                            <span className="text-red-600 font-mono text-xs break-all">{log.error}</span>
                        </div>
                    )}

                    <div>
                        <div className="text-muted-foreground mb-1">Parameters:</div>
                        <pre className="bg-secondary rounded p-2 overflow-x-auto text-xs">
                            {JSON.stringify(log.params, (_, v) =>
                                typeof v === 'bigint' ? v.toString() : v
                                , 2)}
                        </pre>
                    </div>

                    <div>
                        <div className="text-muted-foreground mb-1">Accounts:</div>
                        <div className="space-y-1">
                            {Object.entries(log.accounts).map(([name, address]) => (
                                <div key={name} className="flex gap-2 items-center">
                                    <span className="text-muted-foreground">{name}:</span>
                                    <code className="font-mono bg-secondary px-1 rounded text-xs">
                                        {address.slice(0, 8)}...{address.slice(-4)}
                                    </code>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export function DebugPanel() {
    const { logs, clearLogs, isOpen, togglePanel } = useDebug();

    return (
        <>
            {/* Floating Toggle Button */}
            <button
                onClick={togglePanel}
                className="fixed bottom-4 right-4 z-50 p-3 rounded-full bg-purple-600 hover:bg-purple-700 text-white shadow-lg transition-all"
                title="Toggle Debug Panel"
            >
                <Bug className="w-5 h-5" />
                {logs.some(l => l.status === 'pending') && (
                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-500 rounded-full animate-pulse" />
                )}
                {logs.length > 0 && (
                    <span className="absolute -top-1 -left-1 min-w-5 h-5 flex items-center justify-center bg-indigo-500 rounded-full text-xs">
                        {logs.length}
                    </span>
                )}
            </button>

            {/* Debug Panel */}
            {isOpen && (
                <div className="fixed bottom-20 right-4 z-50 w-[450px] max-h-[70vh] bg-background border rounded-lg shadow-2xl flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between p-3 border-b bg-muted/50">
                        <div className="flex items-center gap-2">
                            <Bug className="w-5 h-5 text-purple-600" />
                            <span className="font-semibold">Contract Calls</span>
                            <Badge variant="secondary">{logs.length}</Badge>
                        </div>
                        <div className="flex items-center gap-1">
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={clearLogs}
                                title="Clear logs"
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={togglePanel}
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Logs */}
                    <ScrollArea className="flex-1 p-3">
                        {logs.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <Bug className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p>No contract calls yet</p>
                                <p className="text-xs">Calls will appear here when you interact with the protocol</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {logs.map(log => (
                                    <LogEntry key={log.id} log={log} />
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </div>
            )}
        </>
    );
}
