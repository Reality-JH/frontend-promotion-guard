import type { FpgConfig, RunRecord } from "./types.js";
export declare function promote(config: FpgConfig, runDir: string, record: RunRecord): Promise<void>;
export declare function rollback(config: FpgConfig, image?: string): Promise<void>;
