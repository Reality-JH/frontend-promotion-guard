import type { CheckResult, FpgConfig, VisualResult } from "./types.js";
export declare function findBrowser(config: FpgConfig): Promise<string>;
export declare function browserIdentity(config: FpgConfig): Promise<string>;
export declare function captureAndCompare(config: FpgConfig, runDir: string, options: {
    compare: boolean;
    update: boolean;
    baseUrl?: string;
}): Promise<{
    checks: CheckResult[];
    visuals: VisualResult[];
}>;
