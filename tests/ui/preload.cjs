const { contextBridge, ipcRenderer } = require('electron');
const callbacks = { created: [], exit: [], data: [], sessions: [], settings: [], extensions: [], ask: [] };
const pr = (number, extra) => ({ repo:'demo/api', number, title:'PR '+number, url:'https://example.test/'+number, author:'me', isDraft:false, updatedAt:new Date().toISOString(), headRefName:'f', baseRefName:'main', reviewDecision:null, mergeable:'MERGEABLE', checks:'SUCCESS', ...extra });
const inbox = { viewer:'me', at:Date.now(), mine:[pr(12,{checks:'FAILURE',title:'Retry uploads on timeout'}), pr(13,{title:'Add dark theme'})], reviewRequested:[pr(14,{author:'teammate',title:'Migrate sessions table'})] };
let next = 3;
const terms = [
 { id:'1', cwd:'/Users/demo/www/deck', agent:'codex', sessionId:'codex:demo', command:'codex' },
 { id:'2', cwd:'/Users/demo/www/api', agent:'claude', sessionId:'claude-demo', command:'claude' },
 { id:'3', cwd:'/Users/demo/www/deck' }
];
const sessions = [
 { session_id:'codex:demo', agent:'codex', cwd:terms[0].cwd, title:'Build a better terminal', status:'working', term_id:'1', issue_key:null, started_at:Date.now()-60000, updated_at:Date.now() },
 { session_id:'claude-demo', agent:'claude', cwd:terms[1].cwd, title:'Review authentication changes', status:'needs_review', term_id:'2', issue_key:'API-42', review_note:'Review the updated session expiry behavior.', started_at:Date.now()-60000, updated_at:Date.now() }
];
ipcRenderer.on('test:sessions', (_event, next) => { sessions.splice(0, sessions.length, ...next); callbacks.sessions.forEach(callback => callback(sessions)); });
const off = (kind,cb) => { callbacks[kind].push(cb); return () => callbacks[kind].splice(callbacks[kind].indexOf(cb),1); };
const settings = {theme:'dark',defaultAgent:'codex',defaultView:'terminal',autoFix:{enabled:true,ci:true,conflicts:true,push:'review'},defaultCwd:'~',repoRoots:[],windowMode:'shared',summonHotkey:'Alt+Space',summonHotkeyEnabled:true,summonDockToTop:true,jira:{onMerge:{enabled:false},doneWindowDays:7},github:{owner:''}};
contextBridge.exposeInMainWorld('deck', {
 getSettings:async()=>settings, updateSettings:async(patch)=>{Object.assign(settings,patch);callbacks.settings.forEach(cb=>cb(settings));return settings},onSettingsChanged:cb=>off('settings',cb),
 extensions:{get:()=>ipcRenderer.invoke('test:catalog'),onChanged:cb=>off('extensions',cb),saveTheme:value=>ipcRenderer.invoke('test:save-theme',value),enablePlugin:(_path,enabled)=>ipcRenderer.invoke('test:enable',enabled),installPlugin:async()=>null,importTheme:async()=>null,openFolder:async()=>{}},
 term:{list:async()=>terms,create:async(opts)=>{const meta={...opts,id:String(++next),cwd:opts.cwd||'/Users/demo/www/deck'};terms.push(meta);callbacks.created.forEach(cb=>cb(meta));return meta},onCreated:cb=>off('created',cb),onExit:cb=>off('exit',cb),onData:cb=>off('data',cb),attach:async(id)=> ({sequence:0,buffer:id==='1'? '\x1b[1mCodex\x1b[0m\r\n\r\n  /Users/demo/www/deck\r\n\r\n› Make Deck my everyday terminal.\r\n\r\n• Codex and Claude now share session tracking, history search,\r\n  and pull request review tools.\r\n\r\n• Running checks…\r\n\r\n\x1b[32m✓\x1b[0m TypeScript checks passed\r\n\x1b[32m✓\x1b[0m Session and transcript tests passed\r\n\r\n› ': '\x1b[32m~/www/deck\x1b[0m \x1b[90mgit:(main)\x1b[0m\r\n❯ '}), resize:()=>{},input:()=>{},kill:id=>{terms.splice(terms.findIndex(t=>t.id===id),1);callbacks.exit.forEach(cb=>cb(id))}},
 sessions:{list:async()=>sessions,onChanged:cb=>off('sessions',cb),hooksInstalled:async()=>true,installHooks:async()=>({installed:true,path:'/tmp/mock'}),remove:async()=>{}},
 git:{summary:async()=>({branch:'main',added:529,removed:331,changedFiles:27}),changes:async()=>({diff:''})},
 search:{query:async()=>[{session_id:'codex:history',agent:'codex',cwd:'/Users/demo/www/deck',title:'Codex conversation',project:'deck',snippet:'Found ⟪terminal⟫',last_at:Date.now()}],session:async()=>[{role:'user',text:'A saved Codex conversation'}],listRepos:async()=>[],github:async()=>[],progress:async()=>({done:true,total:10,scanned:10}),onProgress:()=>()=>{}},
 files:{list:async()=>[{name:'src',path:'src',directory:true},{name:'package.json',path:'package.json',directory:false},{name:'README.md',path:'README.md',directory:false}],read:async()=>({text:'# Deck\n\nYour terminal, your agents.',modified:1}),save:async(root,file,contents)=>contents},
 board:{get:async()=>undefined,onChanged:()=>()=>{}},ask:{onEvent:cb=>off('ask',cb),reset:async()=>{},send:async()=>{callbacks.ask.forEach(cb=>cb({type:'tool',name:'pr_inbox',input:'{}'}));return {ok:true,text:'Ready'}}},
 inbox:{get:async()=>inbox,refresh:async()=>inbox,onChanged:()=>()=>{}},gh:{onPrDrafts:()=>()=>{}}
});
