import { useEffect, useRef, useState } from "react";
import { agentLabels, type Agent } from "../../../shared/agents.js";

export function useAgentChoice(): [Agent, (agent: Agent) => void] {
  const [agent, setAgent] = useState<Agent>("claude");
  const chosen = useRef(false);
  useEffect(() => {
    void window.deck.getSettings().then((settings) => {
      if (!chosen.current) setAgent(settings.defaultAgent);
    });
  }, []);
  return [agent, (next) => { chosen.current = true; setAgent(next); }];
}

export function AgentSelect({ value, onChange }: { value: Agent; onChange: (agent: Agent) => void }) {
  return (
    <select aria-label="Agent" value={value} onChange={(event) => onChange(event.target.value as Agent)}
      className="rounded-md border border-edge2 bg-card px-2 py-1 text-[11px] text-body outline-none">
      {Object.entries(agentLabels).map(([agent, label]) => <option key={agent} value={agent}>{label}</option>)}
    </select>
  );
}
