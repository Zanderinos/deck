import { useEffect, useState } from "react";
import { askModels, type DeckSettings, type OnMergeMode, type OnMergeSettings, type StartCwd } from "../../../shared/settings.js";
import { AgentSelect } from "../agents/AgentSelect.js";
import { Card, control, Field, Toggle } from "./settingsUi.js";
import type { BoardColumnStatuses } from "../../../main/jira.js";

type Patch = Partial<DeckSettings>;

export function GeneralSettings() {
  const [settings, setSettings] = useState<DeckSettings>();
  const [columns, setColumns] = useState<BoardColumnStatuses[]>([]);
  const [columnsError, setColumnsError] = useState("");
  const connection = settings && [settings.jira.baseUrl, settings.jira.email, settings.jira.apiToken, settings.jira.boardId].join("|");
  useEffect(() => { void window.deck.getSettings().then(setSettings); }, []);
  useEffect(() => {
    if (connection === undefined) return;
    window.deck.board.columns()
      .then((fetched) => { setColumns(fetched); setColumnsError(fetched.length ? "" : "Fill in the connection to load the board's columns"); })
      .catch((error: unknown) => setColumnsError(`Could not load board columns: ${String(error)}`));
  }, [connection]);
  if (!settings) return null;
  const columnNames = columns.map((c) => c.name);
  const statusNames = [...new Set(columns.flatMap((c) => c.statuses.map((s) => s.name)))];

  const update = async (patch: Patch) => setSettings(await window.deck.updateSettings(patch));
  const updateJira = (patch: Partial<DeckSettings["jira"]>) => update({ jira: { ...settings.jira, ...patch } });
  const updateAutoFix = (patch: Partial<DeckSettings["autoFix"]>) => update({ autoFix: { ...settings.autoFix, ...patch } });
  const { onMerge } = settings.jira;
  const updateOnMerge = (patch: Partial<OnMergeSettings>) => updateJira({ onMerge: { ...onMerge, ...patch } });
  const onBlurText = (current: string, apply: (value: string) => void, fallback = "") => (e: React.FocusEvent<HTMLInputElement>) => {
    const v = e.target.value.trim() || fallback;
    if (v !== current) apply(v);
  };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-7 py-6 font-sans">
      <div className="grid max-w-[1120px] grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Workspace" description="Where new sessions start, which agent answers by default and which model deck's own agent runs on.">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Default agent">
              <AgentSelect value={settings.defaultAgent} onChange={(defaultAgent) => void update({ defaultAgent })} />
            </Field>
            <Field label="Agent model (default)">
              <select aria-label="Agent model" className={`w-full ${control}`} value={settings.askModel}
                onChange={(e) => void update({ askModel: e.target.value })}>
                {askModels.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </Field>
            <Field label="Start page">
              <select aria-label="Start page" className={`w-full ${control}`} value={settings.defaultView}
                onChange={(e) => void update({ defaultView: e.target.value as DeckSettings["defaultView"] })}>
                <option value="terminal">Terminal</option><option value="agent">Agent</option><option value="reviews">Reviews</option><option value="board">Board</option>
              </select>
            </Field>
          </div>
          <Field label="Default folder" hint="where terminals start when nothing else applies">
            <input placeholder="~" className={`w-full ${control}`} defaultValue={settings.defaultCwd}
              onBlur={onBlurText(settings.defaultCwd, (defaultCwd) => void update({ defaultCwd }), "~")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            {([["tab", "New tab starts in"], ["split", "Split pane starts in"]] as const).map(([action, label]) => (
              <Field key={action} label={label}>
                <select aria-label={label} className={`w-full ${control}`} value={settings.newTerminalCwd[action]}
                  onChange={(e) => void update({ newTerminalCwd: { ...settings.newTerminalCwd, [action]: e.target.value as StartCwd } })}>
                  <option value="current">Active terminal's folder</option>
                  <option value="default">Default folder</option>
                </select>
              </Field>
            ))}
          </div>
          <Field label="Repo roots" hint="searched by ⌘K and the repos fallback, one per line">
            <textarea rows={3} placeholder="~/www" className={`w-full resize-none ${control}`} defaultValue={settings.repoRoots.join("\n")}
              onBlur={(e) => {
                const roots = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
                if (roots.join("\n") !== settings.repoRoots.join("\n")) void update({ repoRoots: roots });
              }} />
          </Field>
        </Card>

        <Card title="Window & hotkey" description="How Deck appears when you summon it from the keyboard or the tray.">
          <Field label="Windows" hint="Tabs and terminals are one shared set, visible in every window.">
            <select className={`w-full ${control}`} value={settings.windowMode}
              onChange={(e) => { const v = e.target.value as DeckSettings["windowMode"]; if (v !== settings.windowMode) void update({ windowMode: v }); }}>
              <option value="shared">One window for both the hotkey and the Dock</option>
              <option value="panel">Hotkey gets its own panel, the Dock a regular window</option>
            </select>
          </Field>
          <Toggle checked={settings.hideFromDock} onChange={(hideFromDock) => void update({ hideFromDock })}>Hide Deck from the Dock and Cmd-Tab (tray and hotkey only)</Toggle>
          <Toggle checked={settings.summonHotkeyEnabled} onChange={(summonHotkeyEnabled) => void update({ summonHotkeyEnabled })}>Enable summon hotkey</Toggle>
          <Toggle checked={settings.summonDockToTop} onChange={(summonDockToTop) => void update({ summonDockToTop })}>Hotkey docks the window to the top of the screen (quake style)</Toggle>
          <Toggle checked={settings.summonHideOnBlur} disabled={!settings.summonDockToTop} onChange={(summonHideOnBlur) => void update({ summonHideOnBlur })}>Hide the quake panel when another app takes focus</Toggle>
          <Field label="Quake panel height" hint="% of the screen; a resize is kept until deck quits">
            <input type="number" min={20} max={100} disabled={!settings.summonDockToTop} className={`w-full ${control}`} defaultValue={Math.round(settings.summonHeightRatio * 100)}
              onBlur={(e) => { const ratio = Math.min(100, Math.max(20, Number(e.target.value) || 60)) / 100; if (ratio !== settings.summonHeightRatio) void update({ summonHeightRatio: ratio }); }} />
          </Field>
          <Field label="Summon hotkey" hint="Electron accelerator">
            <input className={`w-full ${control}`} defaultValue={settings.summonHotkey}
              onBlur={onBlurText(settings.summonHotkey, (summonHotkey) => void update({ summonHotkey }), settings.summonHotkey)} />
          </Field>
        </Card>

        <Card title="Auto-fix my pull requests" description="Start an agent automatically when one of my PRs breaks.">
          {([["enabled", "Auto-fix enabled"], ["ci", "…when CI fails"], ["conflicts", "…when it gets merge conflicts"]] as const).map(([field, text]) => (
            <Toggle key={field} checked={settings.autoFix[field]} disabled={field !== "enabled" && !settings.autoFix.enabled}
              onChange={(checked) => void updateAutoFix({ [field]: checked })}>{text}</Toggle>
          ))}
          <Field label="When the fix is ready">
            <select className={`w-full ${control}`} value={settings.autoFix.push}
              onChange={(e) => void updateAutoFix({ push: e.target.value as DeckSettings["autoFix"]["push"] })}>
              <option value="review">Show me the diff and wait for my approval before pushing</option>
              <option value="push">Commit and push without asking</option>
            </select>
          </Field>
        </Card>

        <Card title="GitHub" description="Scopes PR search to one owner. Leave empty to search all of GitHub.">
          <Field label="Owner">
            <input placeholder="your-org" className={`w-full ${control}`} defaultValue={settings.github.owner}
              onBlur={onBlurText(settings.github.owner, (owner) => void update({ github: { owner } }))} />
          </Field>
        </Card>

        <Card title="Jira" description="Credentials for the board Deck syncs, and how its columns drive the reviews queue and merges." className="lg:col-span-2">
          <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
            <div className="grid grid-cols-2 gap-4">
              {([
                ["baseUrl", "Base URL", "https://yourorg.atlassian.net"],
                ["email", "Email", "you@example.com"],
                ["apiToken", "API token", ""],
                ["boardId", "Board id", "25"],
              ] as const).map(([field, label, placeholder]) => (
                <Field key={field} label={label}>
                  <input type={field === "apiToken" ? "password" : "text"} placeholder={placeholder} className={`w-full ${control}`} defaultValue={settings.jira[field]}
                    onBlur={onBlurText(settings.jira[field], (v) => void updateJira({ [field]: v }))} />
                </Field>
              ))}
              <Field label="Done column window" hint="days">
                <input type="number" min={1} className={`w-full ${control}`} defaultValue={settings.jira.doneWindowDays}
                  onBlur={(e) => { const v = Math.max(1, Number(e.target.value) || 7); if (v !== settings.jira.doneWindowDays) void updateJira({ doneWindowDays: v }); }} />
              </Field>
            </div>
            <div className="flex flex-col gap-4">
              {columnsError && <div className="text-xs text-red">{columnsError}</div>}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Rejected status" hint="cards in this status are flagged">
                  <select className={`w-full ${control}`} value={settings.jira.rejectedPattern} onChange={(e) => void updateJira({ rejectedPattern: e.target.value })}>
                    {!statusNames.includes(settings.jira.rejectedPattern) && <option value={settings.jira.rejectedPattern}>{settings.jira.rejectedPattern}</option>}
                    {statusNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </Field>
                <Field label="Review column" hint="PRs whose card sits here wait on you">
                  <select className={`w-full ${control}`} value={settings.jira.reviewColumns[0] ?? ""} onChange={(e) => void updateJira({ reviewColumns: e.target.value ? [e.target.value] : [] })}>
                    <option value="">All review requests</option>
                    {columnNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </Field>
              </div>
              <Toggle checked={onMerge.enabled} onChange={(enabled) => void updateOnMerge({ enabled })}>Move the issue when its PR is merged from deck</Toggle>
              {onMerge.enabled && (
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Move to">
                    <select className={`w-full ${control}`} value={onMerge.column} onChange={(e) => void updateOnMerge({ column: e.target.value })}>
                      <option value="">Pick a column…</option>
                      {columnNames.map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </Field>
                  <Field label="Where">
                    <select className={`w-full ${control}`} value={onMerge.mode} onChange={(e) => void updateOnMerge({ mode: e.target.value as OnMergeMode })}>
                      <option value="local">On deck's board only (until Jira catches up)</option>
                      <option value="jira">Transition in Jira too</option>
                    </select>
                  </Field>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
