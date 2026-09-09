module.exports = async function checkSidebar({ window, run, click, wait, screenshot }) {
  const initial = await run('window.deck.sessions.list()');
  const session = (id, title, age) => ({ session_id: id, title, agent: 'codex', cwd: '/Users/demo/www/deck', status: 'ended', term_id: null, updated_at: Date.now() - age, started_at: Date.now() - age });
  const older = session('codex:old-suggestion', 'Yesterday’s refactor', 24 * 60 * 60 * 1000);
  const previous = session('codex:previous-suggestion', 'Polish the command palette', 8 * 60 * 1000);
  const latest = session('codex:latest-suggestion', 'Finish the sidebar cleanup', 4 * 60 * 1000);
  const update = async (extra) => { window.webContents.send('test:sessions', [...initial, ...extra]); await wait(150); };
  const hasSuggestions = () => run(`Boolean(document.querySelector('section[aria-label="Session suggestions"]'))`);
  const sidebarText = () => run(`document.querySelector('aside').innerText`);
  const search = async (query) => {
    await run(`(() => { const input = document.querySelector('input[aria-label="Search tabs"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(query)}); input.dispatchEvent(new Event('input',{bubbles:true})); })()`);
    await wait(150);
  };

  const shell = await run('window.deck.term.create({ cwd: "/tmp/codex-startup" })');
  const pending = { ...session(`pending:${shell.id}`, null, 0), cwd: shell.cwd, term_id: shell.id, status: 'idle' };
  await update([pending]);
  if (!(await run(`Boolean(document.querySelector('[aria-label="codex-startup (Codex)"] [title="Ready"]'))`))) throw Error('Idle Codex should be identified before its first prompt');
  await update([]);
  if (!(await run(`Boolean(document.querySelector('[aria-label="codex-startup"]'))`))) throw Error('Exiting before the first prompt should restore the shell tab');
  await update([pending]);
  await update([{ ...pending, session_id: 'codex:startup', title: 'First Codex prompt', status: 'working' }]);
  if (!(await run(`Boolean(document.querySelector('[aria-label="First Codex prompt (Codex)"] [title="Working"]'))`))) throw Error('The first hook should replace the idle Codex placeholder');
  await run(`window.deck.term.kill(${JSON.stringify(shell.id)})`);
  await update([]);

  await update([older, previous, latest]);
  await click('Build a better terminal (Codex)');
  const text = await sidebarText();
  if (!text.includes(latest.title) || text.includes(previous.title) || text.includes(older.title)) throw Error('Sidebar should suggest only the most recent session');
  await screenshot('continue-session');
  await click('More recent (1)');
  if (!(await sidebarText()).includes(previous.title)) throw Error('Other recent sessions should be available on demand');
  await click('Show less');
  await search('Yesterday');
  if (!(await sidebarText()).includes(older.title) || await hasSuggestions()) throw Error('Explicit search should find older sessions without a suggestion card');
  await search('');
  await click('Dismiss all session suggestions');
  if (await hasSuggestions()) throw Error('Dismiss all retained suggestions');
  await click('Toggle sidebar');
  await click('Toggle sidebar');
  if (await hasSuggestions()) throw Error('Dismissal did not survive sidebar remount');
  await search('Finish the sidebar');
  if (!(await sidebarText()).includes(latest.title)) throw Error('Dismissal should preserve searchable sessions');
  await search('');

  await update([older, session('codex:expiring', 'Almost fifteen minutes old', 15 * 60 * 1000 - 1000)]);
  if (!(await hasSuggestions())) throw Error('A session within fifteen minutes should be suggested');
  await wait(1100);
  if (await hasSuggestions()) throw Error('Suggestion did not expire without new session events');

  await update([session('codex:close-all', 'Another recent session', 60 * 1000)]);
  await click('New session');
  await click('Close all tabs');
  if ((await run('window.deck.term.list()')).length || await hasSuggestions()) throw Error('Close all should leave a clear sidebar');
  if ((await run('window.deck.sessions.list()')).length !== initial.length + 1) throw Error('Close all deleted session history');
};
