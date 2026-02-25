const shortcutGroups = [
  {
    label: 'Calendar',
    shortcuts: [
      { keys: ['L'], description: 'Lock / unlock task (hover over slot)' },
    ],
  },
  {
    label: 'Tasks',
    shortcuts: [
      { keys: ['S'], description: 'Select / deselect task (hover over card)' },
      { keys: ['D'], description: 'Toggle selected tasks done / undone' },
      { keys: ['Delete', 'Backspace'], description: 'Delete selected tasks' },
      { keys: ['Escape'], description: 'Clear selection' },
    ],
  },
  {
    label: 'General',
    shortcuts: [
      { keys: ['Escape'], description: 'Close modal / dialog' },
    ],
  },
];

export function HotkeysPanel() {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Keyboard Shortcuts</h2>

      {shortcutGroups.map((group) => (
        <div key={group.label} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{group.label}</h3>
          <div className="flex flex-col gap-1">
            {group.shortcuts.map((shortcut) => (
              <div
                key={shortcut.description}
                className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700"
              >
                <span className="flex items-center gap-1.5">
                  {shortcut.keys.map((key, i) => (
                    <span key={key} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-xs text-gray-400">/</span>}
                      <kbd className="inline-flex items-center justify-center min-w-[1.75rem] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-xs font-mono font-semibold text-gray-700 dark:text-gray-300 shadow-sm">
                        {key}
                      </kbd>
                    </span>
                  ))}
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">{shortcut.description}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
