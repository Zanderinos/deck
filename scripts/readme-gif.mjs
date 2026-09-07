import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import electron from "electron";

const frames = fs.mkdtempSync(path.join(os.tmpdir(), "deck-frames-"));
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const rendered = spawnSync(electron, ["tests/ui/motion.cjs", frames], { stdio: "inherit", env });
if (rendered.status !== 0) process.exit(rendered.status ?? 1);
const input = ["-framerate", "30", "-pattern_type", "glob", "-i", path.join(frames, "*.png")];
const encode = (args, output) => {
  const result = spawnSync("ffmpeg", ["-y", "-loglevel", "error", ...input, ...args, output], { stdio: "inherit" });
  if (result.status !== 0) { console.error("ffmpeg failed; is it installed?"); process.exit(result.status ?? 1); }
  console.log(`Wrote ${output} (${(fs.statSync(output).size / 1e6).toFixed(1)} MB)`);
};
encode(["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-movflags", "+faststart"], "docs/media/deck.mp4");
encode(["-vf", "fps=20,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=192:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle", "-loop", "0"], "docs/media/deck.gif");
fs.rmSync(frames, { recursive: true, force: true });
