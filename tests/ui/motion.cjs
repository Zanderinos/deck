// Renders docs/media/motion/Main.dc.html to PNG frames by seeking its CSS animations. Run via `npm run demo:gif`.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const frames = process.argv[2];
const fps = 30, seconds = 28;
fs.mkdirSync(frames, { recursive: true });
app.whenReady().then(async () => {
  const window = new BrowserWindow({ width: 1280, height: 720, show: false, backgroundColor: '#080808', webPreferences: { offscreen: true } });
  await window.loadFile(path.join(root, 'docs/media/motion/Main.dc.html'));
  const run = (script) => window.webContents.executeJavaScript(script);
  await run(`document.fonts.ready.then(() => Promise.all([...document.images].map(img => img.decode().catch(() => {}))))`);
  await run(`document.getAnimations().forEach(a => a.pause())`);
  for (let i = 0; i < fps * seconds; i++) {
    await run(`document.getAnimations().forEach(a => { a.currentTime = ${(i / fps) * 1000}; })`);
    await new Promise((resolve) => setTimeout(resolve, 16));
    fs.writeFileSync(path.join(frames, String(i).padStart(4, '0') + '.png'), (await window.webContents.capturePage()).toPNG());
  }
  console.log('Rendered ' + fps * seconds + ' frames');
  window.destroy();
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
