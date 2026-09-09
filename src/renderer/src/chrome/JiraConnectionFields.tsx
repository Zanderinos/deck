import type { JiraSettings } from "../../../shared/settings.js";
import { control, Field } from "./settingsUi.js";

const FIELDS = [
  ["baseUrl", "Base URL", "https://yourorg.atlassian.net"],
  ["email", "Email", "you@example.com"],
  ["apiToken", "API token", ""],
  ["boardId", "Board id", "25"],
] as const;

export const TOKEN_PAGE = "https://id.atlassian.com/manage-profile/security/api-tokens";

/** The four values Deck needs to reach a Jira board, shown both in settings
 *  and on the board's own setup card. */
export function JiraConnectionFields({ jira, onChange }: {
  jira: JiraSettings;
  onChange: (patch: Partial<JiraSettings>) => void;
}) {
  return (
    <>
      {FIELDS.map(([field, label, placeholder]) => (
        <Field key={field} label={label} hint={field === "email" ? "your Atlassian account" : undefined}>
          <input type={field === "apiToken" ? "password" : "text"} placeholder={placeholder} className={`w-full ${control}`}
            defaultValue={jira[field]}
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value !== jira[field]) onChange({ [field]: value });
            }} />
        </Field>
      ))}
    </>
  );
}
