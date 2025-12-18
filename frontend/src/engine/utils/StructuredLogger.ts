/**
 * Structured Logger
 * 
 * Provides categorized, leveled logging with export capabilities.
 * Essential for debugging and monitoring in production.
 */

export const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

function getLogLevelName(level: LogLevel): string {
    switch (level) {
        case LogLevel.DEBUG: return 'DEBUG';
        case LogLevel.INFO: return 'INFO';
        case LogLevel.WARN: return 'WARN';
        case LogLevel.ERROR: return 'ERROR';
        default: return 'UNKNOWN';
    }
}

export interface LogEntry {
    timestamp: number;
    level: LogLevel;
    category: string;
    message: string;
    data?: any;
}

export class StructuredLogger {
    private logs: LogEntry[] = [];
    private readonly MAX_LOGS = 1000;
    private logLevel: LogLevel;
    private enableConsole: boolean;

    constructor(
        enableConsole: boolean = true,
        logLevel: LogLevel = LogLevel.INFO
    ) {
        this.enableConsole = enableConsole;
        this.logLevel = logLevel;
    }

    debug(category: string, message: string, data?: any): void {
        this.log(LogLevel.DEBUG, category, message, data);
    }

    info(category: string, message: string, data?: any): void {
        this.log(LogLevel.INFO, category, message, data);
    }

    warn(category: string, message: string, data?: any): void {
        this.log(LogLevel.WARN, category, message, data);
    }

    error(category: string, message: string, data?: any): void {
        this.log(LogLevel.ERROR, category, message, data);
    }

    private log(level: LogLevel, category: string, message: string, data?: any): void {
        if (level < this.logLevel) return;

        const entry: LogEntry = {
            timestamp: Date.now(),
            level,
            category,
            message,
            data
        };

        this.logs.push(entry);

        // Trim old logs
        if (this.logs.length > this.MAX_LOGS) {
            this.logs.shift();
        }

        if (this.enableConsole) {
            this.logToConsole(entry);
        }
    }

    private logToConsole(entry: LogEntry): void {
        const prefix = `[${getLogLevelName(entry.level)}][${entry.category}]`;
        const method = entry.level >= LogLevel.ERROR ? 'error' :
            entry.level >= LogLevel.WARN ? 'warn' : 'log';

        if (entry.data !== undefined) {
            console[method](prefix, entry.message, entry.data);
        } else {
            console[method](prefix, entry.message);
        }
    }

    /**
     * Get logs filtered by category and/or level
     */
    getLogs(category?: string, minLevel?: LogLevel): LogEntry[] {
        return this.logs.filter(log =>
            (!category || log.category === category) &&
            (minLevel === undefined || log.level >= minLevel)
        );
    }

    /**
     * Export all logs as JSON
     */
    exportLogs(): string {
        return JSON.stringify(this.logs, null, 2);
    }

    /**
     * Clear all logs
     */
    clearLogs(): void {
        this.logs = [];
    }

    /**
     * Set log level
     */
    setLogLevel(level: LogLevel): void {
        this.logLevel = level;
    }

    /**
     * Get current log count
     */
    getLogCount(): number {
        return this.logs.length;
    }
}
