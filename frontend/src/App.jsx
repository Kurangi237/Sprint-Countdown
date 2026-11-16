import React, { useEffect, useState } from 'react';

const TARGET_STORAGE_KEY = 'devsync.activeTarget';
const QUEUE_STORAGE_KEY = 'devsync.targetQueue';
const HISTORY_STORAGE_KEY = 'devsync.completedTargets';
const DEFAULT_TARGET = {
  id: 'hackathon-submission',
  name: 'Hackathon Submission',
  deadline: '2026-11-23T23:59:59.000Z',
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

function formatDateTimeLocal(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function getNextTargetDeadline(activeTarget, queuedTargets, currentTime = Date.now()) {
  const latestDeadline = Math.max(
    currentTime,
    new Date(activeTarget.deadline).getTime(),
    ...queuedTargets.map(queuedTarget => new Date(queuedTarget.deadline).getTime())
  );
  return formatDateTimeLocal(new Date(latestDeadline + 60 * 60 * 1000));
}

function getTimeParts(totalSeconds) {
  const days = Math.floor(totalSeconds / (3600 * 24));
  const hours = Math.floor((totalSeconds % (3600 * 24)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [
    { value: days, label: 'Days' },
    { value: hours, label: 'Hours' },
    { value: minutes, label: 'Minutes' },
    { value: seconds, label: 'Seconds' },
  ];
}

export default function DevSyncDashboard() {
  const [milestones, setMilestones] = useState([]);
  const [systemStatus, setSystemStatus] = useState('Connecting...');
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState(() => readStoredValue(TARGET_STORAGE_KEY, DEFAULT_TARGET));
  const [targetQueue, setTargetQueue] = useState(() => {
    const storedTargets = readStoredValue(QUEUE_STORAGE_KEY, []);
    return Array.isArray(storedTargets) ? storedTargets : [];
  });
  const [completedTargets, setCompletedTargets] = useState(() => {
    const storedTargets = readStoredValue(HISTORY_STORAGE_KEY, []);
    return Array.isArray(storedTargets) ? storedTargets : [];
  });
  const [now, setNow] = useState(() => Date.now());
  const [plannedTargetName, setPlannedTargetName] = useState('');
  const [plannedTargetTopics, setPlannedTargetTopics] = useState('');
  const [plannedTargetDeadline, setPlannedTargetDeadline] = useState(() =>
    getNextTargetDeadline(target, targetQueue)
  );
  const [editingTargetId, setEditingTargetId] = useState(null);
  const [editedTargetName, setEditedTargetName] = useState('');
  const [editedTargetDeadline, setEditedTargetDeadline] = useState('');
  const [editedTargetTopics, setEditedTargetTopics] = useState('');
  const [targetError, setTargetError] = useState('');

  useEffect(() => {
    fetch('http://localhost:8000/api/milestones')
      .then(res => {
        if (!res.ok) throw new Error(`Milestones request failed (${res.status})`);
        return res.json();
      })
      .then(data => {
        setMilestones(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Backend connection error:', err);
        setLoading(false);
      });

    fetch('http://localhost:8000/api/health')
      .then(res => {
        if (!res.ok) throw new Error(`Health request failed (${res.status})`);
        return res.json();
      })
      .then(data => setSystemStatus(data.status))
      .catch(() => setSystemStatus('Offline'));

    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const toggleMilestone = async (id, currentStatus) => {
    try {
      const res = await fetch(`http://localhost:8000/api/milestones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: !currentStatus }),
      });
      if (!res.ok) throw new Error(`Milestone update failed (${res.status})`);
      const updated = await res.json();
      setMilestones(currentMilestones =>
        currentMilestones.map(milestone => milestone.id === id ? updated : milestone)
      );
    } catch (err) {
      console.error('Unable to update milestone:', err);
      setMilestones(currentMilestones =>
        currentMilestones.map(milestone =>
          milestone.id === id ? { ...milestone, completed: !currentStatus } : milestone
        )
      );
    }
  };

  const createNextTarget = (event) => {
    event.preventDefault();
    const deadline = new Date(plannedTargetDeadline);
    if (!plannedTargetName.trim()) {
      setTargetError('Give your target a name.');
      return;
    }
    const latestDeadline = Math.max(
      Date.now(),
      new Date(target.deadline).getTime(),
      ...targetQueue.map(queuedTarget => new Date(queuedTarget.deadline).getTime())
    );
    if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= latestDeadline) {
      setTargetError('Choose a deadline after the active target and any queued targets.');
      return;
    }

    const newTarget = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: plannedTargetName.trim(),
      deadline: deadline.toISOString(),
      topics: plannedTargetTopics.split('\n').map(topic => topic.trim()).filter(Boolean),
    };
    const updatedQueue = [
      ...targetQueue,
      newTarget,
    ];
    setTargetQueue(updatedQueue);
    setPlannedTargetName('');
    setPlannedTargetTopics('');
    setTargetError('');

    try {
      window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updatedQueue));
    } catch (error) {
      console.error('Unable to save the target queue to local storage:', error);
      setTargetError('The target was added, but could not be saved in this browser.');
    }
  };

  const editQueuedTarget = (queuedTarget) => {
    setEditingTargetId(queuedTarget.id);
    setEditedTargetName(queuedTarget.name);
    setEditedTargetDeadline(formatDateTimeLocal(new Date(queuedTarget.deadline)));
    setEditedTargetTopics((queuedTarget.topics || []).join('\n'));
    setTargetError('');
  };

  const saveQueuedTarget = (event, queuedTargetId) => {
    event.preventDefault();
    const deadline = new Date(editedTargetDeadline);
    const latestOtherDeadline = Math.max(
      Date.now(),
      new Date(target.deadline).getTime(),
      ...targetQueue
        .filter(queuedTarget => queuedTarget.id !== queuedTargetId)
        .map(queuedTarget => new Date(queuedTarget.deadline).getTime())
    );
    if (!editedTargetName.trim()) {
      setTargetError('Give your target a name.');
      return;
    }
    if (Number.isNaN(deadline.getTime()) || deadline.getTime() <= latestOtherDeadline) {
      setTargetError('Choose a deadline after the active target and other queued targets.');
      return;
    }

    const updatedQueue = targetQueue.map(queuedTarget => queuedTarget.id === queuedTargetId
      ? {
        ...queuedTarget,
        name: editedTargetName.trim(),
        deadline: deadline.toISOString(),
        topics: editedTargetTopics.split('\n').map(topic => topic.trim()).filter(Boolean),
      }
      : queuedTarget
    );
    setTargetQueue(updatedQueue);
    setEditingTargetId(null);
    setTargetError('');
    try {
      window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(updatedQueue));
    } catch (error) {
      console.error('Unable to save the edited target to local storage:', error);
      setTargetError('The target was updated, but could not be saved in this browser.');
    }
  };

  const startNextTarget = () => {
    if (!targetCompleted || targetQueue.length === 0) return;

    const [nextTarget, ...remainingTargets] = targetQueue;
    const updatedHistory = [
      { ...target, completedAt: new Date(now).toISOString() },
      ...completedTargets,
    ];

    setTarget(nextTarget);
    setTargetQueue(remainingTargets);
    setCompletedTargets(updatedHistory);
    setNow(Date.now());
    setPlannedTargetDeadline(getNextTargetDeadline(nextTarget, remainingTargets));

    try {
      window.localStorage.setItem(TARGET_STORAGE_KEY, JSON.stringify(nextTarget));
      window.localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(remainingTargets));
      window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updatedHistory));
    } catch (error) {
      console.error('Unable to save targets to local storage:', error);
    }
  };

  const secondsRemaining = Math.max(
    0,
    Math.floor((new Date(target.deadline).getTime() - now) / 1000)
  );
  const targetCompleted = secondsRemaining === 0;
  const timeParts = getTimeParts(secondsRemaining);
  const completedCount = milestones.filter(milestone => milestone.completed).length;
  const progressPercent = milestones.length
    ? Math.round((completedCount / milestones.length) * 100)
    : 0;
  const targetDate = new Date(target.deadline);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-mono p-4 md:p-8 flex flex-col items-center">
      <header className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs uppercase tracking-widest text-cyan-400 font-semibold">DevSync Command Center</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mt-1">Hackathon Sprint </h1>
        </div>
        <div className="bg-slate-950 px-4 py-3 rounded-lg border border-slate-800 text-right">
          <p className="text-xs text-slate-400 uppercase tracking-wider">{target.name}</p>
          <p className="text-xs text-slate-500 mb-1">
            {targetDate.toLocaleString()}
          </p>
          <div className="flex items-center gap-1" aria-live="polite" aria-label={`${secondsRemaining} seconds remaining`}>
            {timeParts.map(({ value, label }, index) => (
              <React.Fragment key={label}>
                {index > 0 && <span className="text-cyan-700">:</span>}
                <span className="text-xl font-bold text-cyan-400 tabular-nums text-center">
                  {String(value).padStart(2, '0')}
                  <span className="block text-[9px] uppercase tracking-wider text-slate-500">{label}</span>
                </span>
              </React.Fragment>
            ))}
          </div>
        </div>
      </header>

      {target.topics?.length > 0 && (
        <section className="w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-300 tracking-wider uppercase mb-3">
            Work planned for {target.name}
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {target.topics.map((topic, index) => (
              <li key={`${target.id}-${index}`} className="flex items-start gap-2 text-sm text-slate-300">
                <span className="text-cyan-400" aria-hidden="true">•</span>
                <span>{topic}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {targetCompleted && (
        <section
          className="w-full max-w-4xl bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-6 mb-6 shadow-xl"
          aria-live="polite"
        >
          <div className="text-center mb-6">
            <p className="text-4xl mb-2" role="img" aria-label="Celebration">🎉</p>
            <h2 className="text-xl font-bold text-emerald-300">Target reached: {target.name}!</h2>
            <p className="text-sm text-emerald-100/80 mt-2">
              Fantastic work. Take a moment to celebrate, then set your next sprint goal.
            </p>
          </div>
          {targetQueue.length > 0 && (
            <button
              className="mx-auto block rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-400 transition-colors"
              type="button"
              onClick={startNextTarget}
            >
              Start next queued target
            </button>
          )}
        </section>
      )}

      <main className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between shadow-xl">
          <div>
            <h2 className="text-sm font-semibold text-slate-400 tracking-wider uppercase mb-4">Sprint Telemetry</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Status</span>
                <span className={`font-semibold ${targetCompleted ? 'text-emerald-300' : 'text-emerald-400'}`}>
                  {targetCompleted ? 'Target reached' : systemStatus}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Completed</span>
                <span className="text-white font-semibold">{completedCount} / {milestones.length}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span className="text-slate-400">Target deadline</span>
                <span className="text-cyan-400 text-right">{targetDate.toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <div className="flex justify-between text-xs text-slate-400 mb-2">
              <span>Overall Progress</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-slate-950 rounded-full h-3 border border-slate-800 overflow-hidden">
              <div
                className="bg-gradient-to-r from-cyan-500 to-emerald-500 h-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <h2 className="text-sm font-semibold text-slate-400 tracking-wider uppercase mb-4">Execution Milestones</h2>
          {loading ? (
            <p className="text-slate-500 text-center py-8">Loading sprint milestones...</p>
          ) : (
            <div className="space-y-3">
              {milestones.map(milestone => (
                <div
                  key={milestone.id}
                  onClick={() => toggleMilestone(milestone.id, milestone.completed)}
                  className={`flex items-center justify-between p-3.5 rounded-lg border cursor-pointer transition-all ${
                    milestone.completed
                      ? 'bg-slate-950/60 border-emerald-500/30 text-slate-400 line-through'
                      : 'bg-slate-950 border-slate-800 hover:border-cyan-500/50 text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded flex items-center justify-center border ${
                      milestone.completed ? 'bg-emerald-500 border-emerald-500 text-slate-950 font-bold text-xs' : 'border-slate-700 bg-slate-900'
                    }`}>
                      {milestone.completed && '✓'}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{milestone.title}</p>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider">{milestone.category}</span>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded font-semibold ${
                    milestone.completed ? 'bg-slate-900 text-slate-600' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                  }`}>
                    {milestone.t_minus}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <section className="w-full max-w-4xl mt-6 bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-300 tracking-wider uppercase">Plan another target</h2>
            <p className="text-xs text-slate-500 mt-1">Queue upcoming sprint goals without changing the active countdown.</p>
          </div>
          <span className="text-xs text-cyan-400">{targetQueue.length} queued</span>
        </div>
        <form onSubmit={createNextTarget} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
          <label className="text-xs text-slate-300">
            Target name
            <input
              className="block w-full mt-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
              value={plannedTargetName}
              onChange={event => setPlannedTargetName(event.target.value)}
              placeholder="e.g. Ship the next release"
              maxLength={80}
              required
            />
          </label>
          <label className="text-xs text-slate-300">
            Deadline
            <input
              className="block w-full mt-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
              type="datetime-local"
              value={plannedTargetDeadline}
              min={formatDateTimeLocal(new Date(Math.max(
                now,
                new Date(target.deadline).getTime(),
                ...targetQueue.map(queuedTarget => new Date(queuedTarget.deadline).getTime())
              )))}
              onChange={event => setPlannedTargetDeadline(event.target.value)}
              required
            />
          </label>
          <label className="text-xs text-slate-300 md:col-span-2">
            Work topics (one per line)
            <textarea
              className="block w-full mt-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
              value={plannedTargetTopics}
              onChange={event => setPlannedTargetTopics(event.target.value)}
              placeholder={'e.g. Build the API\nWrite integration tests\nPrepare the demo'}
              rows={3}
              maxLength={2000}
            />
          </label>
          <button
            className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-cyan-400 transition-colors md:col-span-2 justify-self-start"
            type="submit"
          >
            Create target
          </button>
        </form>
        {targetError && <p className="text-sm text-rose-300 mt-3" role="alert">{targetError}</p>}
        {targetQueue.length > 0 ? (
          <ol className="mt-5 space-y-2">
            {targetQueue.map((queuedTarget, index) => (
              <li key={queuedTarget.id} className="border-t border-slate-800 pt-3 text-sm">
                {editingTargetId === queuedTarget.id ? (
                  <form onSubmit={event => saveQueuedTarget(event, queuedTarget.id)} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                    <label className="text-xs text-slate-300">
                      Target name
                      <input
                        className="block w-full mt-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
                        value={editedTargetName}
                        onChange={event => setEditedTargetName(event.target.value)}
                        maxLength={80}
                        required
                      />
                    </label>
                    <label className="text-xs text-slate-300">
                      Deadline
                      <input
                        className="block w-full mt-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
                        type="datetime-local"
                        value={editedTargetDeadline}
                        min={formatDateTimeLocal(new Date(Math.max(
                          now,
                          new Date(target.deadline).getTime(),
                          ...targetQueue
                            .filter(item => item.id !== queuedTarget.id)
                            .map(item => new Date(item.deadline).getTime())
                        )))}
                        onChange={event => setEditedTargetDeadline(event.target.value)}
                        required
                      />
                    </label>
                    <label className="text-xs text-slate-300 md:col-span-2">
                      Work topics (one per line)
                      <textarea
                        className="block w-full mt-1 rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:border-cyan-400 focus:outline-none"
                        value={editedTargetTopics}
                        onChange={event => setEditedTargetTopics(event.target.value)}
                        rows={3}
                        maxLength={2000}
                      />
                    </label>
                    <div className="flex gap-2 md:col-span-2">
                      <button className="rounded-lg bg-cyan-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-cyan-400" type="submit">
                        Save changes
                      </button>
                      <button
                        className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:border-slate-500"
                        type="button"
                        onClick={() => {
                          setEditingTargetId(null);
                          setTargetError('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <span className="text-white">{index + 1}. {queuedTarget.name}</span>
                      <div className="flex items-center gap-3">
                        <time className="text-xs text-slate-500">{new Date(queuedTarget.deadline).toLocaleString()}</time>
                        <button
                          className="text-xs text-cyan-400 hover:text-cyan-300"
                          type="button"
                          onClick={() => editQueuedTarget(queuedTarget)}
                          aria-label={`Edit ${queuedTarget.name}`}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                    {queuedTarget.topics?.length > 0 && (
                      <ul className="mt-2 ml-4 list-disc space-y-1 text-xs text-slate-400">
                        {queuedTarget.topics.map((topic, topicIndex) => (
                          <li key={`${queuedTarget.id}-topic-${topicIndex}`}>{topic}</li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-xs text-slate-500">No upcoming targets yet. Add one to plan your next sprint.</p>
        )}
      </section>

      {completedTargets.length > 0 && (
        <section className="w-full max-w-4xl mt-6 bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-400 tracking-wider uppercase mb-3">Completed Targets</h2>
          <ul className="space-y-2">
            {completedTargets.map(completedTarget => (
              <li key={completedTarget.id} className="flex justify-between gap-4 text-sm">
                <span className="text-emerald-300">✓ {completedTarget.name}</span>
                <time className="text-slate-500 text-right">
                  {new Date(completedTarget.completedAt).toLocaleString()}
                </time>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-8 text-xs text-slate-600 text-center">
        DevSync Command Center • Built for Handshake AI Skills Studio X Google Challenge
      </footer>
    </div>
  );
}
