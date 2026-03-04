import { useState, useRef, useEffect } from 'react';
import { useProjects } from '../../hooks/useProjects';
import { useTasks } from '../../hooks/useTasks';

export function ProjectsPage() {
  const { projects, createProject, deleteProject } = useProjects();
  const { tasks } = useTasks();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) { setAdding(false); return; }
    await createProject.mutateAsync(name);
    setNewName('');
    setAdding(false);
  };

  const handleDelete = (id: string, name: string) => {
    const count = tasks.filter((t) => t.project_id === id).length;
    const msg = count > 0
      ? `Delete "${name}"? ${count} task${count !== 1 ? 's' : ''} will have their project cleared.`
      : `Delete "${name}"?`;
    if (confirm(msg)) deleteProject.mutate(id);
  };

  return (
    <div className="max-w-lg mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Projects</h2>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/90 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Project
        </button>
      </div>

      {adding && (
        <div className="flex gap-2 items-center border border-accent rounded-lg px-3 py-2 bg-white dark:bg-gray-800">
          <input
            ref={inputRef}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
              else if (e.key === 'Escape') { setNewName(''); setAdding(false); }
            }}
            onBlur={handleAdd}
            placeholder="Project name…"
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none"
          />
        </div>
      )}

      {projects.length === 0 && !adding ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <p className="text-sm">No projects yet. Create one to organise your tasks.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {projects.map((p) => {
            const taskCount = tasks.filter((t) => t.project_id === p.id).length;
            return (
              <li
                key={p.id}
                className="flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{p.name}</span>
                  <span className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {taskCount} task{taskCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <button
                  onClick={() => handleDelete(p.id, p.name)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded"
                  title="Delete project"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
