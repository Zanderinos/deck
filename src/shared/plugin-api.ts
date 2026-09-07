import type { PluginAction, PluginContext } from "./extensions.js";

export interface ThemeDefinition {
  id: string;
  name: string;
  extends?: string;
  appearance?: "dark" | "light";
  colors?: Partial<import("./themes.js").ThemeColors>;
  terminal?: Record<string, string>;
}
export interface DeckPluginAPI {
  registerCommand(id: string, command: {
    title: string;
    description?: string;
    run(context: PluginContext): PluginAction | void | Promise<PluginAction | void>;
  }): void;
  registerTheme(theme: ThemeDefinition): void;
  registerPanel(id: string, panel: { title: string; markdown: string }): void;
  on(event: "session:changed", handler: (context: PluginContext) => void): () => void;
}
export type ActivatePlugin = (deck: DeckPluginAPI) => void | (() => void) | Promise<void | (() => void)>;
export type { PluginAction, PluginContext };
