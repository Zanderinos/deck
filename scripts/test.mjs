import { spawnSync } from "node:child_process";
import electron from "electron";

// Native dependencies are rebuilt for Electron by postinstall. Run tests
// under the same Node ABI without launching the desktop application.
const result = spawnSync(electron, ["node_modules/vitest/vitest.mjs", "run", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
