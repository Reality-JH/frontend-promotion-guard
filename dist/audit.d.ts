import type { CheckResult, FpgConfig } from "./types.js";
export declare function auditCss(config: FpgConfig): Promise<CheckResult[]>;
export declare function selectorPresent(css: string, selector: string): boolean;
export declare function assertChecks(checks: CheckResult[]): void;
