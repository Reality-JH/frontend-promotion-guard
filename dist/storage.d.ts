import type { FpgConfig } from "./types.js";
export declare function syncBaselines(config: FpgConfig, direction: "pull" | "push"): Promise<void>;
