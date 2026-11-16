import React, { useEffect, useMemo, useState } from 'react';

const TASKS_STORAGE_KEY = 'devsync.tasks.v2';
const LEGACY_ACTIVE_KEY = 'devsync.activeTarget';
const LEGACY_QUEUE_KEY = 'devsync.targetQueue';
const LEGACY_HISTORY_KEY = 'devsync.completedTargets';

const STARTER_MILESTONES = [
  { id: 'architecture', title: 'Architecture & schema', completed: true },
  { id: 'backend', title: 'Backend implementation', completed: false },
  { id: 'frontend', title: 'Frontend implementation', completed: false },
  { id: 'testing', title: 'Testing and release', completed: false },
];

const DEFAULT_TASK = {
  id: 'hackathon-submission',
  name: 'Hackathon Submission',
  startsAt: new Date().toISOString(),
  deadline: '2026-11-23T23:59:59.000Z',
  status: 'active',
  topics: [],
  milestones: STARTER_MILESTONES,
};

function readStoredValue(key, fallback) {
  try {
    const storedValue = window.localStorage.getItem(key);
    return storedValue ? JSON.parse(storedValue) : fallback;
  } catch (error) {
    console.error(`Unable to read ${key} from local storage:`, error);
    return fallback;
  }
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatDateTimeLocal(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function getInitialTasks() {
  const savedTasks = readStoredValue(TASKS_STORAGE_KEY, null);
  if (Array.isArray(savedTasks)) {
    return savedTasks.map(task => ({
      ...task,
      topics: Array.isArray(task.topics) ? task.topics : [],
      milestones: Array.isArray(task.milestones) ? task.milestones : [],
    }));
  }

  const activeTask = readStoredValue(LEGACY_ACTIVE_KEY, DEFAULT_TASK);
  const queuedTasks = readStoredValue(LEGACY_QUEUE_KEY, []);
  const completedTasks = readStoredValue(LEGACY_HISTORY_KEY, []);
  let previousDeadline = activeTask.deadline;
  const migratedQueue = (Array.isArray(queuedTasks) ? queuedTasks : []).map(task => {
    const migratedTask = {
      ...task,
      startsAt: task.startsAt || previousDeadline,
      status: 'scheduled',
      topics: Array.isArray(task.topics) ? task.topics : [],
      milestones: Array.isArray(task.milestones) ? task.milestones : [],
    };
    previousDeadline = task.deadline;
    return migratedTask;
  });
  return [
    {
      ...DEFAULT_TASK,
      ...activeTask,
      startsAt: activeTask.startsAt || new Date().toISOString(),
      status: activeTask.status || 'active',
      topics: Array.isArray(activeTask.topics) ? activeTask.topics : [],
      milestones: Array.isArray(activeTask.milestones)
        ? activeTask.milestones
        : STARTER_MILESTONES,
    },
    ...migratedQueue,
    ...(Array.isArray(completedTasks) ? completedTasks : []).map(task => ({
      ...task,
      startsAt: task.startsAt || task.completedAt || task.deadline,
      status: 'completed',
      topics: Array.isArray(task.topics) ? task.topics : [],
      milestones: Array.isArray(task.milestones) ? task.milestones : [],
    })),
  ];
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, totalSeconds);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [
    days > 0 ? `${days}d` : null,
    `${String(hours).padStart(2, '0')}h`,
    `${String(minutes).padStart(2, '0')}m`,
    `${String(remainder).padStart(2, '0')}s`,
  ].filter(Boolean).join(' : ');
}

function getTaskTime(task, now) {
  if (task.status === 'paused') return task.remainingSeconds || 0;
  const end = task.status === 'scheduled' ? task.startsAt : task.deadline;
  return Math.max(0, Math.floor((new Date(end).getTime() - now) / 1000));
}

function parseLines(lines) {
  return lines.split('\n').map(line => line.trim()).filter(Boolean);
}

function taskStatusLabel(task) {
  if (task.status === 'active') return 'Running';
  if (task.status === 'scheduled') return 'Upcoming';
  if (task.status === 'paused') return 'Paused';
  return 'Completed';
}

function taskStatusStyle(task) {
  if (task.status === 'active') return 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300';
  if (task.status === 'scheduled') return 'border-violet-500/30 bg-violet-500/10 text-violet-300';
  if (task.status === 'paused') return 'border-amber-500/30 bg-amber-500/10 text-amber-300';
  return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';
}

export default function DevSyncDashboard() {
  const [tasks, setTasks] = useState(getInitialTasks);
  const [now, setNow] = useState(() => Date.now());
  const [newName, setNewName] = useState('');
  const [newStartsAt, setNewStartsAt] = useState(() => formatDateTimeLocal(new Date()));
  const [newDeadline, setNewDeadline] = useState(() =>
    formatDateTimeLocal(new Date(Date.now() + 60 * 60 * 1000))
  );
  const [newTopics, setNewTopics] = useState('');
  const [formError, setFormError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editStartsAt, setEditStartsAt] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [editTopics, setEditTopics] = useState('');
  const [newMilestone, setNewMilestone] = useState({});
  const [editingMilestone, setEditingMilestone] = useState(null);
  const [milestoneEditTitle, setMilestoneEditTitle] = useState('');
  const [completionNotice, setCompletionNotice] = useState('');

  useEffect(() => {
    const ticker = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(ticker);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
      setStorageError('');
    } catch (error) {
      console.error('Unable to save sprint tasks to local storage:', error);
      setStorageError('Changes are not being saved. Check available browser storage.');
    }
  }, [tasks]);

  useEffect(() => {
    const handleStorage = event => {
      if (event.key !== TASKS_STORAGE_KEY || !event.newValue) return;
      try {
        const sharedTasks = JSON.parse(event.newValue);
        if (Array.isArray(sharedTasks)) setTasks(sharedTasks);
      } catch (error) {
        console.error('Unable to sync sprint tasks from another browser tab:', error);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  useEffect(() => {
    setTasks(currentTasks => {
      let changed = false;
      const updatedTasks = currentTasks.map(task => {
        if (task.status === 'scheduled' && new Date(task.startsAt).getTime() <= now) {
          changed = true;
          const expired = new Date(task.deadline).getTime() <= now;
          if (expired) setCompletionNotice(`🎉 ${task.name} reached its deadline. Great work!`);
          return expired
            ? { ...task, status: 'completed', completedAt: new Date(now).toISOString() }
            : { ...task, status: 'active' };
        }
        if (task.status === 'active' && new Date(task.deadline).getTime() <= now) {
          changed = true;
          setCompletionNotice(`🎉 ${task.name} reached its deadline. Great work!`);
          return { ...task, status: 'completed', completedAt: new Date(now).toISOString() };
        }
        return task;
      });
      return changed ? updatedTasks : currentTasks;
    });
  }, [now]);

  const activeTasks = useMemo(() => tasks.filter(task => task.status === 'active'), [tasks]);
  const upcomingTasks = useMemo(
    () => tasks.filter(task => task.status === 'scheduled').sort(
      (a, b) => new Date(a.startsAt) - new Date(b.startsAt)
    ),
    [tasks]
  );
  const pausedTasks = useMemo(() => tasks.filter(task => task.status === 'paused'), [tasks]);
  const completedTasks = useMemo(
    () => tasks.filter(task => task.status === 'completed').sort(
      (a, b) => new Date(b.completedAt || b.deadline) - new Date(a.completedAt || a.deadline)
    ),
    [tasks]
  );

  const createTask = event => {
    event.preventDefault();
    const startsAt = new Date(newStartsAt);
    const deadline = new Date(newDeadline);
    const nowTime = Date.now();
    if (!newName.trim()) {
      setFormError('Add a name for this task.');
      return;
    }
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(deadline.getTime()) || deadline <= startsAt) {
      setFormError('The deadline must be later than the start time.');
      return;
    }
    if (startsAt.getTime() < nowTime - 60000) {
      setFormError('Choose a start time that is now or in the future.');
      return;
    }

    setTasks(currentTasks => [...currentTasks, {
      id: createId(),
      name: newName.trim(),
      startsAt: startsAt.toISOString(),
      deadline: deadline.toISOString(),
      status: startsAt.getTime() > nowTime + 1000 ? 'scheduled' : 'active',
      topics: parseLines(newTopics),
      milestones: [],
    }]);
    setNewName('');
    setNewTopics('');
    setFormError('');
  };

  const deleteTask = task => {
    if (!window.confirm(`Delete "${task.name}" and its milestones?`)) return;
    setTasks(currentTasks => currentTasks.filter(item => item.id !== task.id));
  };

  const updateTask = (taskId, updates) => {
    setTasks(currentTasks => currentTasks.map(task =>
      task.id === taskId ? { ...task, ...updates } : task
    ));
  };

  const startEditingTask = task => {
    setEditingTaskId(task.id);
    setEditName(task.name);
    setEditStartsAt(formatDateTimeLocal(new Date(task.startsAt)));
    setEditDeadline(formatDateTimeLocal(new Date(task.deadline)));
    setEditTopics((task.topics || []).join('\n'));
    setFormError('');
  };

  const saveTaskEdit = (event, task) => {
    event.preventDefault();
    const startsAt = new Date(editStartsAt);
    const deadline = new Date(editDeadline);
    if (!editName.trim()) {
      setFormError('Add a name for this task.');
      return;
    }
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(deadline.getTime()) || deadline <= startsAt) {
      setFormError('The deadline must be later than the start time.');
      return;
    }
    const status = task.status === 'completed'
      ? 'completed'
      : task.status === 'paused'
        ? 'paused'
        : startsAt.getTime() > Date.now()
          ? 'scheduled'
          : 'active';
    updateTask(task.id, {
      name: editName.trim(),
      startsAt: startsAt.toISOString(),
      deadline: deadline.toISOString(),
      status,
      topics: parseLines(editTopics),
    });
    setEditingTaskId(null);
    setFormError('');
  };

  const toggleMilestone = (task, milestoneId) => {
    updateTask(task.id, {
      milestones: task.milestones.map(milestone => milestone.id === milestoneId
        ? { ...milestone, completed: !milestone.completed }
        : milestone
      ),
    });
  };

  const addMilestone = (event, task) => {
    event.preventDefault();
    const title = (newMilestone[task.id] || '').trim();
    if (!title) return;
    updateTask(task.id, {
      milestones: [...task.milestones, { id: createId(), title, completed: false }],
    });
    setNewMilestone(current => ({ ...current, [task.id]: '' }));
  };

  const beginMilestoneEdit = milestone => {
    setEditingMilestone(milestone.id);
    setMilestoneEditTitle(milestone.title);
  };

  const saveMilestoneEdit = (event, task) => {
    event.preventDefault();
    const title = milestoneEditTitle.trim();
    if (!title) return;
    updateTask(task.id, {
      milestones: task.milestones.map(milestone => milestone.id === editingMilestone
        ? { ...milestone, title }
        : milestone
      ),
    });
    setEditingMilestone(null);
  };

  const deleteMilestone = (task, milestoneId) => {
    updateTask(task.id, {
      milestones: task.milestones.filter(milestone => milestone.id !== milestoneId),
    });
  };

  const pauseTask = task => {
    const remainingSeconds = Math.max(
      0,
      Math.floor((new Date(task.deadline).getTime() - Date.now()) / 1000)
    );
    updateTask(task.id, { status: 'paused', remainingSeconds });
  };

  const resumeTask = task => updateTask(task.id, {
    status: 'active',
    deadline: new Date(Date.now() + (task.remainingSeconds || 0) * 1000).toISOString(),
    remainingSeconds: undefined,
  });

  const activateTask = task => updateTask(task.id, {
    status: 'active',
    startsAt: new Date().toISOString(),
    deadline: new Date(Date.now() + Math.max(
      60,
      Math.floor((new Date(task.deadline).getTime() - new Date(task.startsAt).getTime()) / 1000)
    ) * 1000).toISOString(),
  });

  const completeTask = task => {
    setCompletionNotice(`🎉 ${task.name} marked complete. Great work!`);
    updateTask(task.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    });
  };

  const milestoneStats = tasks.reduce((stats, task) => ({
    total: stats.total + task.milestones.length,
    completed: stats.completed + task.milestones.filter(item => item.completed).length,
  }), { total: 0, completed: 0 });

  const renderTask = task => {
    const taskSeconds = getTaskTime(task, now);
    const completedMilestones = task.milestones.filter(milestone => milestone.completed).length;
    const taskProgress = task.milestones.length
      ? Math.round((completedMilestones / task.milestones.length) * 100)
      : 0;
    const isEditing = editingTaskId === task.id;

    return (
      <article key={task.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${taskStatusStyle(task)}`}>
                {taskStatusLabel(task)}
              </span>
              <span className="text-xs text-slate-500">
                {task.status === 'scheduled' ? 'Starts' : 'Deadline'}: {new Date(task.status === 'scheduled' ? task.startsAt : task.deadline).toLocaleString()}
              </span>
            </div>
            {isEditing ? (
              <form onSubmit={event => saveTaskEdit(event, task)} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <label className="text-xs text-slate-300">
                  Task name
                  <input
                    className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    value={editName}
                    onChange={event => setEditName(event.target.value)}
                    maxLength={100}
                    required
                  />
                </label>
                <label className="text-xs text-slate-300">
                  Start time
                  <input
                    className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    type="datetime-local"
                    value={editStartsAt}
                    onChange={event => setEditStartsAt(event.target.value)}
                    required
                  />
                </label>
                <label className="text-xs text-slate-300">
                  Deadline
                  <input
                    className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    type="datetime-local"
                    value={editDeadline}
                    onChange={event => setEditDeadline(event.target.value)}
                    required
                  />
                </label>
                <label className="text-xs text-slate-300 md:col-span-2">
                  Work topics (one per line)
                  <textarea
                    className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                    value={editTopics}
                    onChange={event => setEditTopics(event.target.value)}
                    rows={3}
                    maxLength={2000}
                  />
                </label>
                <div className="flex gap-2 md:col-span-2">
                  <button className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950" type="submit">Save task</button>
                  <button className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300" type="button" onClick={() => setEditingTaskId(null)}>Cancel</button>
                </div>
              </form>
            ) : (
              <>
                <h3 className="break-words text-lg font-bold text-white">{task.name}</h3>
                <p className="mt-1 text-xs text-slate-500">
                  {task.status === 'scheduled'
                    ? `Starts ${new Date(task.startsAt).toLocaleString()}`
                    : `Due ${new Date(task.deadline).toLocaleString()}`}
                </p>
              </>
            )}
          </div>
          <div className="shrink-0 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-center sm:min-w-52">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">
              {task.status === 'scheduled' ? 'Starts in' : task.status === 'paused' ? 'Time paused' : task.status === 'completed' ? 'Finished' : 'Time remaining'}
            </p>
            <p className={`mt-1 text-sm font-bold tabular-nums ${task.status === 'completed' ? 'text-emerald-300' : 'text-cyan-300'}`}>
              {task.status === 'completed' ? 'Target reached' : formatDuration(taskSeconds)}
            </p>
          </div>
        </div>

        {task.topics?.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Work topics</p>
            <ul className="grid gap-1 sm:grid-cols-2">
              {task.topics.map((topic, index) => (
                <li key={`${task.id}-topic-${index}`} className="flex gap-2 text-xs text-slate-300">
                  <span className="text-cyan-400" aria-hidden="true">•</span>{topic}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 border-t border-slate-800 pt-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Task milestones <span className="text-slate-600">({completedMilestones}/{task.milestones.length})</span>
            </h4>
            {task.milestones.length > 0 && (
              <span className="text-xs text-cyan-400">{taskProgress}%</span>
            )}
          </div>
          {task.milestones.length > 0 && (
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-950">
              <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all" style={{ width: `${taskProgress}%` }} />
            </div>
          )}
          <ul className="space-y-2">
            {task.milestones.map(milestone => (
              <li key={milestone.id} className="flex items-center gap-2 rounded-lg bg-slate-950/60 px-3 py-2">
                <input
                  aria-label={`Mark ${milestone.title} complete`}
                  className="h-4 w-4 accent-emerald-500"
                  type="checkbox"
                  checked={milestone.completed}
                  onChange={() => toggleMilestone(task, milestone.id)}
                />
                {editingMilestone === milestone.id ? (
                  <form onSubmit={event => saveMilestoneEdit(event, task)} className="flex min-w-0 flex-1 gap-2">
                    <input
                      aria-label="Milestone title"
                      className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white"
                      value={milestoneEditTitle}
                      onChange={event => setMilestoneEditTitle(event.target.value)}
                      maxLength={120}
                      required
                      autoFocus
                    />
                    <button className="text-xs text-cyan-400" type="submit">Save</button>
                    <button className="text-xs text-slate-500" type="button" onClick={() => setEditingMilestone(null)}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <span className={`min-w-0 flex-1 break-words text-xs ${milestone.completed ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                      {milestone.title}
                    </span>
                    <button className="text-xs text-cyan-500 hover:text-cyan-300" type="button" onClick={() => beginMilestoneEdit(milestone)} aria-label={`Edit ${milestone.title}`}>Edit</button>
                    <button className="text-xs text-rose-400 hover:text-rose-300" type="button" onClick={() => deleteMilestone(task, milestone.id)} aria-label={`Delete ${milestone.title}`}>Delete</button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <form onSubmit={event => addMilestone(event, task)} className="mt-3 flex gap-2">
            <input
              aria-label={`New milestone for ${task.name}`}
              className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-600"
              placeholder="Add a task-specific milestone"
              maxLength={120}
              value={newMilestone[task.id] || ''}
              onChange={event => setNewMilestone(current => ({ ...current, [task.id]: event.target.value }))}
            />
            <button className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-cyan-300 hover:border-cyan-500" type="submit">Add milestone</button>
          </form>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4">
          {task.status === 'active' && (
            <button className="rounded-lg border border-amber-500/40 px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/10" type="button" onClick={() => pauseTask(task)}>Pause</button>
          )}
          {task.status === 'paused' && (
            <button className="rounded-lg border border-cyan-500/40 px-3 py-2 text-xs text-cyan-300 hover:bg-cyan-500/10" type="button" onClick={() => resumeTask(task)}>Resume</button>
          )}
          {task.status === 'scheduled' && (
            <button className="rounded-lg border border-cyan-500/40 px-3 py-2 text-xs text-cyan-300 hover:bg-cyan-500/10" type="button" onClick={() => activateTask(task)}>Start now</button>
          )}
          {task.status !== 'completed' && (
            <button className="rounded-lg border border-emerald-500/40 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-500/10" type="button" onClick={() => completeTask(task)}>Complete task</button>
          )}
          <button className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-slate-500" type="button" onClick={() => startEditingTask(task)}>Edit task</button>
          <button className="ml-auto rounded-lg border border-rose-500/30 px-3 py-2 text-xs text-rose-300 hover:bg-rose-500/10" type="button" onClick={() => deleteTask(task)}>Delete task</button>
        </div>
      </article>
    );
  };

  const renderSection = (title, items, emptyMessage) => (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">{title}</h2>
        <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs text-slate-400">{items.length}</span>
      </div>
      {items.length > 0
        ? items.map(renderTask)
        : <p className="rounded-xl border border-dashed border-slate-800 px-4 py-6 text-center text-xs text-slate-500">{emptyMessage}</p>}
    </section>
  );

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-6 font-mono text-slate-100 md:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="h-3 w-3 animate-pulse rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold uppercase tracking-widest text-cyan-400">Sprint Countdown</span>
            </div>
            <h1 className="text-2xl font-bold text-white">Sprint Command Center</h1>
            <p className="mt-1 text-xs text-slate-500">Run multiple tasks, schedule upcoming work, and track each task’s milestones.</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[
              { label: 'Running', count: activeTasks.length, tone: 'text-cyan-300' },
              { label: 'Upcoming', count: upcomingTasks.length, tone: 'text-violet-300' },
              { label: 'Paused', count: pausedTasks.length, tone: 'text-amber-300' },
              { label: 'Milestones', count: `${milestoneStats.completed}/${milestoneStats.total}`, tone: 'text-emerald-300' },
            ].map(item => (
              <div key={item.label} className="min-w-20 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2">
                <p className={`text-lg font-bold tabular-nums ${item.tone}`}>{item.count}</p>
                <p className="text-[9px] uppercase tracking-wider text-slate-500">{item.label}</p>
              </div>
            ))}
          </div>
        </header>

        {storageError && <p className="mb-4 rounded-lg border border-rose-500/40 bg-rose-950/40 p-3 text-xs text-rose-200" role="alert">{storageError}</p>}
        {completionNotice && (
          <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-950/40 p-3 text-sm text-emerald-200" role="status">
            <span>{completionNotice}</span>
            <button className="text-xs text-emerald-400 hover:text-white" type="button" onClick={() => setCompletionNotice('')}>Dismiss</button>
          </div>
        )}

        <section className="mb-7 rounded-xl border border-cyan-500/20 bg-slate-900 p-5 shadow-xl">
          <div className="mb-4">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-300">Create a task</h2>
            <p className="mt-1 text-xs text-slate-500">Start another task now or schedule it for later. Multiple tasks can run at once.</p>
          </div>
          <form onSubmit={createTask} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-xs text-slate-300">
              Task name
              <input
                className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white"
                value={newName}
                onChange={event => setNewName(event.target.value)}
                placeholder="e.g. Build authentication"
                maxLength={100}
                required
              />
            </label>
            <label className="text-xs text-slate-300">
              Start time
              <input className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" type="datetime-local" value={newStartsAt} onChange={event => setNewStartsAt(event.target.value)} required />
            </label>
            <label className="text-xs text-slate-300">
              Deadline
              <input className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" type="datetime-local" value={newDeadline} min={newStartsAt} onChange={event => setNewDeadline(event.target.value)} required />
            </label>
            <label className="text-xs text-slate-300 md:col-span-2">
              Work topics (one per line)
              <textarea className="mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white" value={newTopics} onChange={event => setNewTopics(event.target.value)} placeholder={'Design API endpoints\nImplement login screen\nWrite tests'} rows={3} maxLength={2000} />
            </label>
            {formError && <p className="text-xs text-rose-300 md:col-span-2" role="alert">{formError}</p>}
            <button className="w-fit rounded-lg bg-cyan-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-cyan-400 md:col-span-2" type="submit">
              Create task
            </button>
          </form>
        </section>

        <div className="space-y-8">
          {renderSection('Running now', activeTasks, 'No tasks running. Create a task or start one from the upcoming list.')}
          {renderSection('Upcoming schedule', upcomingTasks, 'No scheduled tasks. Set a future start time when creating a task.')}
          {renderSection('Paused', pausedTasks, 'No paused tasks.')}
          {completedTasks.length > 0 && renderSection('Completed', completedTasks, 'No completed tasks.')}
        </div>

        <footer className="mt-8 text-center text-[10px] text-slate-600">
          Task data is saved in this browser and syncs across tabs in the same browser profile.
        </footer>
      </div>
    </div>
  );
}
