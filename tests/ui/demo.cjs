// Records the README tour as PNG frames using the smoke-test fixtures. Run via `npm run demo:gif`.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const frames = process.argv[2] || path.join(root, 'artifacts/demo');
fs.rmSync(frames, { recursive: true, force: true });
fs.mkdirSync(frames, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'deck-demo-'));
app.setPath('userData', profile);
app.whenReady().then(async () => {
  const themeBundle = path.join(profile, 'themes.cjs');
  require('esbuild').buildSync({ entryPoints: [path.join(root, 'src/shared/themes.ts')], outfile: themeBundle, bundle: true, platform: 'node', format: 'cjs' });
  const { builtInThemes } = require(themeBundle);
  ipcMain.handle('test:catalog', () => ({ themes: builtInThemes, plugins: [], errors: [], themesDirectory: profile, pluginsDirectory: profile }));
  const window = new BrowserWindow({ width: 1280, height: 800, show: false, webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true }, backgroundColor: '#080808' });
  await window.loadFile(path.join(root, 'out/renderer/index.html'));
  const run = (script) => window.webContents.executeJavaScript(script);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let index = 0;
  let recording = true;
  const record = (async () => { while (recording) { const image = await window.webContents.capturePage(); fs.writeFileSync(path.join(frames, String(index++).padStart(4, '0') + '.png'), image.toPNG()); await wait(80); } })();
  const click = async (label, pause = 900) => {
    const found = await run(`(() => { const button = [...document.querySelectorAll('button,[role=button]')].find(button => button.getAttribute('aria-label') === ${JSON.stringify(label)} || button.title === ${JSON.stringify(label)} || button.textContent.trim() === ${JSON.stringify(label)}); if (!button) return false; button.click(); return true; })()`);
    if (!found) throw Error('Missing control: ' + label);
    await wait(pause);
  };
  const key = async (key, modifiers = {}, pause = 900) => { await run(`window.dispatchEvent(new KeyboardEvent('keydown', ${JSON.stringify({ key, bubbles: true, cancelable: true, ...modifiers })}))`); await wait(pause); };
  const type = async (selector, text) => {
    for (let i = 1; i <= text.length; i++) {
      await run(`(() => { const input = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(text)}.slice(0, ${i})); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
      await wait(90);
    }
  };
  await wait(1200);
  await click('Build a better terminal (Codex)', 1600);
  await click('Split right', 1600);
  await key('k', { metaKey: true }, 700);
  await type('input[aria-label="Search Deck"]', 'terminal');
  await wait(1400);
  await key('Escape', {}, 600);
  await click('agent', 1800);
  await click('My PRs needing attention', 2600);
  await click('reviews', 2400);
  await click('Next review', 1600);
  await key('Enter', { metaKey: true, shiftKey: true }, 2200);
  await key('p', { metaKey: true, shiftKey: true }, 2200);
  await click('Exit presentation view', 1200);
  recording = false;
  await record;
  console.log('Recorded ' + index + ' frames to ' + frames);
  window.destroy();
  app.quit();
}).catch((error) => { console.error(error); app.exit(1); });
setTimeout(() => { console.error('Demo recording timed out'); app.exit(1); }, 60000).unref();
