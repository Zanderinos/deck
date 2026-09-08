import { useState } from "react";
import type { View } from "../App.js";
import { Icon } from "../board/icons.js";
import { useAgentSessions } from "../lib/useSessions.js";
import { AgentChat } from "./AgentChat.js";
import { useAttentionCount } from "./attention.js";

// Deck's agent from any page: a button in the bottom-right corner (like
// Linear's) that opens the same conversation the agent page shows.

export function AgentDock({ onView }: { onView: (view: View) => void }) {
  const [open, setOpen] = useState(() => localStorage.getItem("deck.agent.dock") === "open");
  const sessions = useAgentSessions();
  const attention = useAttentionCount();
  const toggle = (next: boolean) => { localStorage.setItem("deck.agent.dock", next ? "open" : "closed"); setOpen(next); };

  if (!open) {
    return (
      <button onClick={() => toggle(true)} aria-label="Open agent" title="Ask deck's agent"
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-edge2 bg-panel px-3.5 py-2 text-[12px] text-ink shadow-[0_8px_30px_#0008] hover:border-edge3">
        <Icon name="sparkle" size={14} className="text-accent" />
        Agent
        {attention > 0 && <span className="rounded-full bg-orange px-1.5 text-[10px] font-bold text-bg">{attention}</span>}
      </button>
    );
  }

  return (
    <section aria-label="Agent dock" className="fixed bottom-4 right-4 z-40 flex h-[600px] max-h-[calc(100vh-6rem)] w-[440px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-edge2 bg-panel shadow-[0_12px_40px_#000a]">
      <div className="flex items-center gap-2 border-b border-edge px-4 py-2.5">
        <Icon name="sparkle" size={14} className="text-accent" />
        <span className="text-[12px] font-bold text-ink">Agent</span>
        <button onClick={() => { toggle(false); onView("agent"); }} aria-label="Open agent page" title="Open the agent page" className="ml-auto rounded p-1 text-dim hover:text-ink"><Icon name="expand" size={12} /></button>
        <button onClick={() => toggle(false)} aria-label="Close agent dock" className="rounded p-1 text-dim hover:text-ink"><Icon name="x" size={12} /></button>
      </div>
      <AgentChat compact sessions={sessions.filter((s) => s.status !== "ended")} />
    </section>
  );
}
