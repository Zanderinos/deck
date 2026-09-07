/** @param {import('../../../src/shared/plugin-api').DeckPluginAPI} deck */
export default function activate(deck) {
  deck.registerCommand('workspace', {
    title: 'Workspace overview',
    description: 'Show the active directory, agent, and useful Deck shortcuts.',
    run(context) {
      return {
        type: 'panel',
        title: 'Workspace overview',
        markdown: [
          `## ${context.sessionTitle || 'Your workspace'}`,
          `Directory: \`${context.cwd || 'No terminal selected'}\``,
          `Agent: **${context.agent || 'Shell'}** · Theme: **${context.theme}**`,
          '### Stay in flow',
          '- **⌘K** — search sessions, history, and commands',
          '- **⌘D** — split right',
          '- **⌘⇧↵** — Zen view',
          '- **⌘⇧P** — Presentation view',
          '- **⌘J** — multiline terminal input',
        ].join('\n\n'),
      };
    },
  });

  // Events can maintain plugin state. Return cleanup for other hosts/tools;
  // Deck terminates this worker when the plugin is disabled or reloaded.
  return deck.on('session:changed', (context) => {
    // Add your own workspace-aware behavior here.
  });
}
