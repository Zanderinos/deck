import { boardProviderLabels } from "../../../shared/board.js";
import type { BoardProviderKind, DeckSettings } from "../../../shared/settings.js";
import { control, Field } from "./settingsUi.js";

type ConnectionBlock = "jira" | "linear" | "githubProjects";

interface Connection {
  block: ConnectionBlock;
  /** field, label, placeholder */
  fields: readonly (readonly [string, string, string])[];
  help: string;
  /** Where the credential comes from, linked from the help text. */
  tokenPage?: string;
}

/** What each tracker needs to reach its board. The block names the settings
 *  group the fields are stored in. */
const CONNECTIONS: Record<BoardProviderKind, Connection> = {
  jira: {
    block: "jira",
    fields: [
      ["baseUrl", "Base URL", "https://yourorg.atlassian.net"],
      ["email", "Email", "you@example.com"],
      ["apiToken", "API token", ""],
      ["boardId", "Board id", "25"],
    ],
    help: "The token comes from your Atlassian account. The board id is the number in your board's URL.",
    tokenPage: "https://id.atlassian.com/manage-profile/security/api-tokens",
  },
  linear: {
    block: "linear",
    fields: [
      ["apiKey", "API key", ""],
      ["teamKey", "Team key", "ENG"],
    ],
    help: "Create a personal API key in Linear's API settings. The team key is the prefix of the team's issue identifiers.",
    tokenPage: "https://linear.app/settings/account/security",
  },
  github: {
    block: "githubProjects",
    fields: [
      ["owner", "Owner", "your-org"],
      ["projectNumber", "Project number", "3"],
    ],
    help: "Uses your gh CLI login, which needs the project scope: gh auth refresh -s project. The project number is in the project's URL.",
  },
};

const SECRETS = new Set(["apiToken", "apiKey"]);

export function boardConnectionHelp(provider: BoardProviderKind): Pick<Connection, "help" | "tokenPage"> {
  return CONNECTIONS[provider];
}

/** Whether every connection value the chosen tracker needs is filled in. */
export function boardConnected(settings: DeckSettings): boolean {
  const { block, fields } = CONNECTIONS[settings.board.provider];
  const values: Record<string, string> = { ...settings[block] };
  return fields.every(([field]) => Boolean(values[field]));
}

/** The provider picker plus the connection values it needs, shown both in
 *  settings and on the board's own setup card. */
export function BoardConnectionFields({ settings, onChange }: {
  settings: DeckSettings;
  onChange: (patch: Partial<DeckSettings>) => void;
}) {
  const provider = settings.board.provider;
  const { block, fields } = CONNECTIONS[provider];
  const values: Record<string, string> = { ...settings[block] };
  return (
    <>
      <Field label="Tracker">
        <select aria-label="Tracker" className={`w-full ${control}`} value={provider}
          onChange={(event) => onChange({ board: { ...settings.board, provider: event.target.value as BoardProviderKind } })}>
          {Object.entries(boardProviderLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
        </select>
      </Field>
      {fields.map(([field, label, placeholder]) => (
        <Field key={`${provider}.${field}`} label={label} hint={field === "email" ? "your Atlassian account" : undefined}>
          <input type={SECRETS.has(field) ? "password" : "text"} placeholder={placeholder} className={`w-full ${control}`}
            defaultValue={values[field]}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value !== values[field]) onChange({ [block]: { ...values, [field]: value } });
            }} />
        </Field>
      ))}
    </>
  );
}
