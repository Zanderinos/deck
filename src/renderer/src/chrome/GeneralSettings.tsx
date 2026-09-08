import { useEffect, useState } from "react";
import { askModels, type DeckSettings, type OnMergeMode, type OnMergeSettings } from "../../../shared/settings.js";
import { AgentSelect } from "../agents/AgentSelect.js";
import type { BoardColumnStatuses } from "../../../main/jira.js";

type Patch = Partial<DeckSettings>;

const control = "rounded-md border border-edge2 bg-card px-2 py-1.5 text-sm text-ink outline-none focus:border-accent";

function Card({ title, description, children, className = "" }: { title: string; description: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-edge2 bg-panel p-5 ${className}`}>
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-mut">{description}</p>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-dim">{label}</span>
      {hint && <span className="ml-1.5 text-[11px] text-mut">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function Toggle({ checked, disabled, onChange, children }: { checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void; children: React.ReactNode }) {
  return (
    <label className={`flex items-center gap-2 text-xs ${disabled ? "text-mut" : "text-dim"}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

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
          <Field label="New terminals start in">
            <input placeholder="~" className={`w-full ${control}`} defaultValue={settings.defaultCwd}
              onBlur={onBlurText(settings.defaultCwd, (defaultCwd) => void update({ defaultCwd }), "~")} />
          </Field>
          <Field label="Repo roots" hint="searched by ⌘K and the repos fallback, one per line">
            <textarea rows={3} placeholder="~/www" className={`w-full resize-none ${control}`} defaultValue={settings.repoRoots.join("\n")}
              onBlur={(e) => {
                const roots = e.target.value.split("\n").map((s) => s.trim()).filter(Boolean);
                if (roots.join("\n") !== settings.repoRoots.join("\n")) void update({ repoRoots: roots });
              }} />
          </Field>
        </Card>

        <Card title="Window & hotkey" description="How Deck appears when you summon it from the keyboard or the tray.">
          <Field label="Windows">
            <select className={`w-full ${control}`} value={settings.windowMode}
              onChange={(e) => { const v = e.target.value as DeckSettings["windowMode"]; if (v !== settings.windowMode) void update({ windowMode: v }); }}>
              <option value="shared">One shared window for hotkey, tray and manual open</option>
              <option value="panel">Separate hotkey panel + main window for tray/manual</option>
              <option value="per-entry">Separate windows for hotkey, tray and manual open</option>
            </select>
          </Field>
          <Toggle checked={settings.summonHotkeyEnabled} onChange={(summonHotkeyEnabled) => void update({ summonHotkeyEnabled })}>Enable summon hotkey</Toggle>
          <Toggle checked={settings.summonDockToTop} onChange={(summonDockToTop) => void update({ summonDockToTop })}>Hotkey docks the window to the top of the screen (quake style)</Toggle>
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
