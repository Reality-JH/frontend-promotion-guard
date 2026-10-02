import type { FpgConfig } from "./types.js";
import { run } from "./utils.js";

export async function syncBaselines(config: FpgConfig, direction: "pull" | "push") {
  const sync = config.visual.remoteSync?.[direction];
  if (!sync) throw new Error(`visual.remoteSync.${direction} is not configured`);
  try {
    await run(sync.command, sync.args, config.rootDir);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`baseline ${direction} failed: ${detail.length > 500 ? `…${detail.slice(-500)}` : detail}`);
  }
}
