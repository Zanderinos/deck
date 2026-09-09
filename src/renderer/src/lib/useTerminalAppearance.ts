import { defaultSettings } from "../../../shared/settings.js";
import { terminalOptions } from "../../../shared/terminal.js";
import { useSettings } from "./useSettings.js";

export function useTerminalAppearance(): ReturnType<typeof terminalOptions> {
  const settings = useSettings();
  return terminalOptions(settings?.terminalAppearance ?? defaultSettings.terminalAppearance);
}
