import { spawnSync } from "node:child_process";
import electron from "electron";

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const result = spawnSync(electron, ["tests/ui/smoke.cjs", ...process.argv.slice(2)], { stdio: "inherit", env });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
