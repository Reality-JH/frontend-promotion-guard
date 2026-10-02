import type { FpgConfig } from "./types.js";
export type MonitorEvent = "down" | "recovered";
export type MonitorState = {
    status: "up" | "down";
    consecutiveFailures: number;
    lastCheckedAt?: string;
    lastEvent?: MonitorEvent;
    lastEventAt?: string;
};
export type MonitorRound = {
    failures: string[];
    reportPath: string;
};
export type MonitorCheck = (runDir: string) => Promise<MonitorRound>;
export type MonitorAlert = {
    event: MonitorEvent;
    target: string;
    failures: string[];
    reportPath: string;
    at: string;
};
export declare function runMonitor(config: FpgConfig, options?: {
    once?: boolean;
    baseUrl?: string;
}, check?: MonitorCheck): Promise<MonitorState>;
