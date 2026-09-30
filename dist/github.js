import { appendFile } from "node:fs/promises";
import { join } from "node:path";
export async function writeGithubOutputs(runDir, record) {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    const outputPath = process.env.GITHUB_OUTPUT;
    if (!summaryPath && !outputPath) {
        console.log("--github: GITHUB_STEP_SUMMARY and GITHUB_OUTPUT are not set; skipping GitHub writeback");
        return;
    }
    const failedChecks = record.checks.filter((item) => item.status === "failed");
    const failedVisuals = record.visuals.filter((item) => item.status === "failed");
    const result = failedChecks.length + failedVisuals.length ? "failed" : "passed";
    const maxDiff = record.visuals.reduce((max, item) => Math.max(max, item.diffPixelRatio), 0);
    const lines = [
        `## Frontend Promotion Guard: ${record.command}`,
        "",
        `Result: **${result}** · Max diff ratio: **${(maxDiff * 100).toFixed(3)}%**`,
        `Evidence: \`${join(runDir, "report.html")}\``,
        "",
    ];
    if (record.visuals.length) {
        lines.push("| Route | Viewport | Diff | Status |", "|---|---|---|---|");
        for (const item of record.visuals)
            lines.push(`| ${cell(item.route)} | ${item.viewport} | ${(item.diffPixelRatio * 100).toFixed(3)}% | ${item.status} |`);
        lines.push("");
    }
    const failures = [
        ...failedChecks.map((item) => `${item.name}: ${item.detail}`),
        ...failedVisuals.map((item) => `${item.route} ${item.viewport}: diff ${(item.diffPixelRatio * 100).toFixed(3)}%`),
    ];
    if (failures.length) {
        lines.push("### Failed checks", "");
        for (const failure of failures)
            lines.push(`- ${failure.replace(/\s*\n\s*/g, " ")}`);
        lines.push("");
    }
    if (summaryPath)
        await appendFile(summaryPath, `${lines.join("\n")}\n`);
    if (outputPath)
        await appendFile(outputPath, `result=${result}\ndiffRatio=${maxDiff}\n`);
    for (const failure of failures)
        console.log(`::error ::${commandValue(failure)}`);
}
const cell = (value) => value.replace(/\|/g, "\\|");
const commandValue = (value) => value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
