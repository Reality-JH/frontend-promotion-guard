import type { RunRecord } from "./types.js";
export declare function saveRecord(runDir: string, record: RunRecord): Promise<void>;
export declare function loadRecord(runDir: string): Promise<RunRecord>;
export declare function renderReport(run: RunRecord): string;
