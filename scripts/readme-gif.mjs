import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import electron from "electron";

const frames = fs.mkdtempSync(path.join(os.tmpdir(), "deck-frames-"));
const output = "docs/media/deck.gif";
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const recorded = spawnSync(electron, ["tests/ui/demo.cjs", frames], { stdio: "inherit", env });
if (recorded.status !== 0) process.exit(recorded.status ?? 1);
const filters = "fps=12,scale=1000:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle";
const encoded = spawnSync("ffmpeg", ["-y", "-framerate", "12", "-pattern_type", "glob", "-i", path.join(frames, "*.png"), "-vf", filters, "-loop", "0", output], { stdio: "inherit" });
fs.rmSync(frames, { recursive: true, force: true });
if (encoded.status !== 0) { console.error("ffmpeg failed; is it installed?"); process.exit(encoded.status ?? 1); }
console.log(`Wrote ${output} (${(fs.statSync(output).size / 1e6).toFixed(1)} MB)`);
