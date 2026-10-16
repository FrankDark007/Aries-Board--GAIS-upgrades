/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  CheckSquare,
  Kanban,
  ListChecks,
  Mail,
  Plus,
  ShieldCheck,
  Sparkles,
  Undo2,
  Users,
  X,
} from 'lucide-react';
import BoardView, {
  BoardCardItem,
  KanbanStatus,
  TeamMember,
  cardTitle,
  isAutoResolved,
  isUrgentCard,
} from './components/BoardView';

interface TodoItem {
  id: string;
  text: string;
  details?: string;
  client?: string;
  section?: string;
  assignee?: string;
  due?: string;
  urgent?: boolean;
  done?: boolean;
  archived?: boolean;
  sourceAccount?: string;
  notificationDate?: string;
}

interface ThreadPayload {
  subject: string;
  messages: Array<{ from: string; to?: string; date: string; body: string }>;
}

const TODO_NICKNAMES: Record<string, string> = {
  tom: 'thomas',
  tommy: 'thomas',
  mike: 'michael',
  bob: 'robert',
  bobby: 'robert',
  rob: 'robert',
  bill: 'william',
  will: 'william',
  jim: 'james',
  liz: 'elizabeth',
  beth: 'elizabeth',
  dave: 'david',
  steve: 'steven',
  kate: 'katherine',
  katie: 'katherine',
  sue: 'susan',
};

function extractCanonicalSurname(rawClient?: string): string | null {
  const cleaned = String(rawClient || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z,&+/ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || cleaned === 'unidentified matter' || cleaned === 'general') return null;
  const chunks = cleaned.split(/\s*(?:&|\+|\/|\band\b)\s*/).filter(Boolean);
  let lastSurname: string | null = null;
  for (const chunk of chunks) {
    const pieces = chunk.split(/\s*,\s*/).filter(Boolean);
    const normalized =
      pieces.length === 2 && !pieces[0].includes(' ')
        ? `${pieces[1]} ${pieces[0]}`
        : pieces.join(' ');
    const words = normalized.split(/\s+/).filter(Boolean);
    if (words.length >= 1) {
      lastSurname = words[words.length - 1];
    }
  }
  return lastSurname && lastSurname.length >= 2 ? lastSurname : null;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'board' | 'todos'>('board');
  const [boardItems, setBoardItems] = useState<BoardCardItem[]>([]);
  const [stageOverrides, setStageOverrides] = useState<Record<number, 'open' | 'in_progress' | 'resolved'>>({});
  const [team, setTeam] = useState<TeamMember[]>([
    { key: 'frank', name: 'Frank' },
    { key: 'mark', name: 'Mark' },
    { key: 'steve', name: 'Steve' },
    { key: 'shayan', name: 'Shayan' },
    { key: 'katherine', name: 'Katherine' },
  ]);
  const [viewer, setViewer] = useState<TeamMember | null>({ key: 'frank', name: 'Frank' });
  const [activeEmailIdentity, setActiveEmailIdentity] = useState<string>('darakhshan.farough@gmail.com');
  const [threadIds, setThreadIds] = useState<Set<number>>(new Set());
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const [isStaleSnapshot, setIsStaleSnapshot] = useState<boolean>(false);
  const [loadingBoard, setLoadingBoard] = useState<boolean>(true);

  // To-Do state
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [showCompletedTodos, setShowCompletedTodos] = useState<boolean>(false);
  const [newTodoText, setNewTodoText] = useState('');
  const [newTodoClient, setNewTodoClient] = useState('');
  const [newTodoAssignee, setNewTodoAssignee] = useState('');

  // Email Thread Modal state
  const [activeThreadCard, setActiveThreadCard] = useState<BoardCardItem | null>(null);
  const [activeThreadData, setActiveThreadData] = useState<ThreadPayload | null>(null);
  const [loadingThread, setLoadingThread] = useState<boolean>(false);

  // Toast with 5-second Undo
  const [toast, setToast] = useState<{
    message: string;
    isError?: boolean;
    onUndo?: () => void;
  } | null>(null);

  const showToast = useCallback((message: string, isError = false, onUndo?: () => void) => {
    setToast({ message, isError, onUndo });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const apiFetch = useCallback(
    async (path: string, init?: RequestInit) => {
      const sep = path.includes('?') ? '&' : '?';
      const url = `${path}${sep}as_email=${encodeURIComponent(activeEmailIdentity)}`;
      return fetch(url, init);
    },
    [activeEmailIdentity]
  );

  const loadBoardData = useCallback(async () => {
    setLoadingBoard(true);
    try {
      const res = await apiFetch('/api/board');
      if (!res.ok) throw new Error('Failed to load board');
      const data = await res.json();
      setBoardItems(Array.isArray(data.items) ? data.items : []);
      if (Array.isArray(data.team) && data.team.length) setTeam(data.team);
      if (data.me) setViewer(data.me);
      setThreadIds(new Set(Array.isArray(data.thread_ids) ? data.thread_ids.map(Number) : []));
      setPublishedAt(data.published_at || null);
      setIsStaleSnapshot(Boolean(data.stale?.is_stale));
    } catch (err: any) {
      showToast(err?.message || 'Unable to load board', true);
    } finally {
      setLoadingBoard(false);
    }
  }, [apiFetch, showToast]);

  const loadTodosData = useCallback(async () => {
    try {
      const res = await apiFetch('/api/todos');
      if (!res.ok) return;
      const data = await res.json();
      setTodos(Array.isArray(data.items) ? data.items : []);
    } catch {
      // ignore background error
    }
  }, [apiFetch]);

  useEffect(() => {
    loadBoardData();
    loadTodosData();
  }, [loadBoardData, loadTodosData]);

  const postBoardAction = useCallback(
    async (payload: Record<string, unknown>) => {
      const res = await apiFetch('/api/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Action failed');
      }
      return res.json();
    },
    [apiFetch]
  );

  const enrichedItems = useMemo(() => {
    return boardItems.map((item) => {
      const stage = stageOverrides[item.id];
      return stage ? { ...item, stage } : item;
    });
  }, [boardItems, stageOverrides]);

  const handleCardDone = useCallback(
    async (card: BoardCardItem, reason?: string) => {
      const prevStatus = card.status;
      const prevStage = stageOverrides[card.id];
      setBoardItems((prev) =>
        prev.map((item) => (item.id === card.id ? { ...item, status: 'done' } : item))
      );
      setStageOverrides((prev) => ({ ...prev, [card.id]: 'resolved' }));

      try {
        await postBoardAction({
          operation: 'done',
          id: card.id,
          ...(reason ? { note: `Completed: ${reason}` } : {}),
        });
        showToast(`Marked #${card.id} done`, false, async () => {
          setBoardItems((prev) =>
            prev.map((item) => (item.id === card.id ? { ...item, status: prevStatus || 'open' } : item))
          );
          setStageOverrides((prev) => {
            const copy = { ...prev };
            if (prevStage) copy[card.id] = prevStage;
            else delete copy[card.id];
            return copy;
          });
          await postBoardAction({ operation: 'reopen', id: card.id });
          showToast(`Reopened #${card.id}`);
        });
      } catch (err: any) {
        showToast(err?.message || 'Could not complete card', true);
        loadBoardData();
      }
    },
    [postBoardAction, showToast, loadBoardData, stageOverrides]
  );

  const handleCardReopen = useCallback(
    async (card: BoardCardItem) => {
      setBoardItems((prev) =>
        prev.map((item) => (item.id === card.id ? { ...item, status: 'open', auto_resolved_candidate: false } : item))
      );
      setStageOverrides((prev) => ({ ...prev, [card.id]: 'open' }));
      try {
        await postBoardAction({ operation: 'reopen', id: card.id });
        showToast(`Reopened #${card.id}`);
      } catch (err: any) {
        showToast(err?.message || 'Could not reopen card', true);
        loadBoardData();
      }
    },
    [postBoardAction, showToast, loadBoardData]
  );

  const handleCardAssign = useCallback(
    async (card: BoardCardItem, ownerKey: string) => {
      setBoardItems((prev) =>
        prev.map((item) => (item.id === card.id ? { ...item, assignee: ownerKey } : item))
      );
      if (ownerKey && (!stageOverrides[card.id] || stageOverrides[card.id] === 'open')) {
        setStageOverrides((prev) => ({ ...prev, [card.id]: 'in_progress' }));
      }
      try {
        await postBoardAction({ operation: 'assign', id: card.id, value: ownerKey });
        const ownerName = team.find((m) => m.key === ownerKey)?.name || (ownerKey ? ownerKey : 'Unassigned');
        showToast(`Assigned #${card.id} to ${ownerName}`);
      } catch (err: any) {
        showToast(err?.message || 'Could not assign card', true);
        loadBoardData();
      }
    },
    [postBoardAction, team, showToast, loadBoardData, stageOverrides]
  );

  const handleCardSnooze = useCallback(
    async (card: BoardCardItem, isoDate: string) => {
      setBoardItems((prev) =>
        prev.map((item) => (item.id === card.id ? { ...item, status: 'snoozed', due: isoDate } : item))
      );
      try {
        await postBoardAction({ operation: 'snooze', id: card.id, value: isoDate });
        showToast(`Snoozed #${card.id} until ${isoDate}`, false, async () => {
          await postBoardAction({ operation: 'reopen', id: card.id });
          loadBoardData();
        });
      } catch (err: any) {
        showToast(err?.message || 'Could not snooze card', true);
        loadBoardData();
      }
    },
    [postBoardAction, showToast, loadBoardData]
  );

  const handleCardUrgent = useCallback(
    async (card: BoardCardItem, urgent: boolean) => {
      setBoardItems((prev) =>
        prev.map((item) =>
          item.id === card.id
            ? { ...item, urgent: urgent ? 'yes' : '', priority: urgent ? 1 : 2 }
            : item
        )
      );
      try {
        await postBoardAction({ operation: 'urgent', id: card.id, value: urgent ? 'yes' : '' });
        showToast(urgent ? `Marked #${card.id} urgent` : `Cleared urgent flag on #${card.id}`);
      } catch (err: any) {
        showToast(err?.message || 'Could not update urgency', true);
        loadBoardData();
      }
    },
    [postBoardAction, showToast, loadBoardData]
  );

  const handleCardStageChange = useCallback(
    async (card: BoardCardItem, targetColumn: KanbanStatus) => {
      if (targetColumn === 'Resolved') {
        await handleCardDone(card);
        return;
      }
      if (card.status === 'done') {
        await postBoardAction({ operation: 'reopen', id: card.id });
      }
      const nextStage = targetColumn === 'In Progress' ? 'in_progress' : 'open';
      setStageOverrides((prev) => ({ ...prev, [card.id]: nextStage }));
      setBoardItems((prev) =>
        prev.map((item) =>
          item.id === card.id
            ? {
                ...item,
                status: 'open',
                auto_resolved_candidate: false,
                assignee:
                  targetColumn === 'In Progress' && !item.assignee && viewer
                    ? viewer.key
                    : item.assignee,
              }
            : item
        )
      );
      if (targetColumn === 'In Progress' && !card.assignee && viewer) {
        await postBoardAction({ operation: 'assign', id: card.id, value: viewer.key });
      }
      showToast(`Moved #${card.id} to ${targetColumn}`);
    },
    [handleCardDone, postBoardAction, viewer, showToast]
  );

  const handleAutoCloseHandled = useCallback(
    async (ids?: number[]) => {
      try {
        const res = await apiFetch('/api/board/auto-close-handled', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(ids ? { ids } : {}),
        });
        if (!res.ok) throw new Error('Auto-close request failed');
        const data = await res.json();
        const closedIds = new Set<number>((data.closed_ids || []).map(Number));
        setBoardItems((prev) =>
          prev.map((item) => (closedIds.has(item.id) ? { ...item, status: 'done' } : item))
        );
        showToast(`Auto-closed ${closedIds.size} handled card(s)`);
      } catch (err: any) {
        showToast(err?.message || 'Could not auto-close handled cards', true);
      }
    },
    [apiFetch, showToast]
  );

  const handleBulkDone = useCallback(
    async (ids: number[]) => {
      if (!ids.length) return;
      setBoardItems((prev) =>
        prev.map((item) => (ids.includes(item.id) ? { ...item, status: 'done' } : item))
      );
      try {
        for (const id of ids) {
          await postBoardAction({ operation: 'done', id });
        }
        showToast(`Marked ${ids.length} card(s) done`, false, async () => {
          for (const id of ids) {
            await postBoardAction({ operation: 'reopen', id });
          }
          await loadBoardData();
        });
      } catch (err: any) {
        showToast(err?.message || 'Bulk Done failed', true);
        loadBoardData();
      }
    },
    [postBoardAction, showToast, loadBoardData]
  );

  const handleMergeClaimDuplicates = useCallback(
    async (groupMembers: BoardCardItem[]) => {
      if (groupMembers.length < 2) return;
      const sorted = [...groupMembers].sort((a, b) => b.id - a.id);
      const newest = sorted[0];
      const older = sorted.slice(1);
      setBoardItems((prev) =>
        prev.map((item) =>
          older.some((o) => o.id === item.id) ? { ...item, status: 'done' } : item
        )
      );
      try {
        for (const dup of older) {
          await postBoardAction({
            operation: 'note',
            id: dup.id,
            note: `Merged into #${newest.id} and closed as older duplicate.`,
          });
          await postBoardAction({ operation: 'done', id: dup.id });
        }
        showToast(`Kept #${newest.id} open and closed ${older.length} older duplicate(s)`);
      } catch (err: any) {
        showToast(err?.message || 'Could not merge duplicates', true);
        loadBoardData();
      }
    },
    [postBoardAction, showToast, loadBoardData]
  );

  const handleOpenEmailThread = useCallback(
    async (card: BoardCardItem) => {
      setActiveThreadCard(card);
      setActiveThreadData(null);
      setLoadingThread(true);
      try {
        const res = await apiFetch(`/api/thread?id=${card.id}`);
        if (!res.ok) throw new Error('Could not load email chain');
        const data = await res.json();
        setActiveThreadData(data);
      } catch (err: any) {
        showToast(err?.message || 'Could not load email thread', true);
      } finally {
        setLoadingThread(false);
      }
    },
    [apiFetch, showToast]
  );

  // To-Do actions (works for ALL roster members: Frank, Mark, Steve, Katherine, Shayan, Dom)
  const submitTodoAction = useCallback(
    async (taskId: string, verb: string, payload: Record<string, unknown>) => {
      const eventId = `ui-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const res = await apiFetch('/api/todo/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId,
          taskId,
          verb,
          timestamp: new Date().toISOString(),
          payload,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'To-Do update failed');
      }
      const data = await res.json();
      if (Array.isArray(data.items)) setTodos(data.items);
      return data;
    },
    [apiFetch]
  );

  const groupedTodos = useMemo(() => {
    const visible = todos.filter((item) => {
      if (item.archived && !showCompletedTodos) return false;
      if (item.done && !showCompletedTodos) return false;
      return true;
    });

    const surnameBuckets = new Map<string, TodoItem[]>();
    for (const item of visible) {
      const surname = extractCanonicalSurname(item.client || item.section);
      if (surname) {
        if (!surnameBuckets.has(surname)) surnameBuckets.set(surname, []);
        surnameBuckets.get(surname)!.push(item);
      }
    }

    const groups = new Map<string, { key: string; label: string; items: TodoItem[] }>();
    for (const item of visible) {
      const rawLabel = String(item.client || item.section || 'Unidentified matter').trim();
      const surname = extractCanonicalSurname(rawLabel);
      let key = `section:${rawLabel.toLowerCase()}`;
      let label = rawLabel;
      if (surname) {
        key = `client:${surname}`;
        const candidates = (surnameBuckets.get(surname) || [item])
          .map((i) => String(i.client || i.section || '').trim())
          .filter(Boolean)
          .sort((a, b) => b.length - a.length);
        if (candidates.length) label = candidates[0];
      }
      if (!groups.has(key)) groups.set(key, { key, label, items: [] });
      groups.get(key)!.items.push(item);
    }

    return Array.from(groups.values());
  }, [todos, showCompletedTodos]);

  const summaryStats = useMemo(() => {
    const open = boardItems.filter((i) => i.status !== 'done' && i.status !== 'snoozed');
    return {
      openCount: open.length,
      readyCount: open.filter((i) => isAutoResolved(i)).length,
      urgentCount: open.filter((i) => isUrgentCard(i)).length,
      assignedCount: open.filter((i) => Boolean(i.assignee)).length,
    };
  }, [boardItems]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Top Operational Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-base shadow-2xs">
              ♈
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold tracking-tight text-slate-900">
                  Aries Operations Workspace
                </h1>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                    isStaleSnapshot
                      ? 'bg-amber-50 text-amber-800 border-amber-200'
                      : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isStaleSnapshot ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                  />
                  {isStaleSnapshot ? 'Snapshot Stale' : 'Live D1 Sync'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Flood Doctor · Curated Claim Triage & Shared To-Do v2
              </p>
            </div>
          </div>

          {/* Navigation Tabs & Active Roster Identity Switcher */}
          <div className="flex flex-wrap items-center gap-2.5">
            <nav className="inline-flex p-1 rounded-lg bg-slate-100 border border-slate-200/80">
              <button
                type="button"
                onClick={() => setActiveTab('board')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  activeTab === 'board'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Kanban className="w-3.5 h-3.5" />
                Kanban Board ({summaryStats.openCount})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('todos')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                  activeTab === 'todos'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5" />
                Shared To-Do ({todos.filter((t) => !t.done).length})
              </button>
            </nav>

            {/* Roster Identity Switcher (verifies Fix 3: Steve, Katherine, Shayan, Dom can act) */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-500 font-medium">Viewing as:</span>
              <select
                aria-label="Viewing as teammate"
                value={activeEmailIdentity}
                onChange={(e) => setActiveEmailIdentity(e.target.value)}
                className="font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="darakhshan.farough@gmail.com">Frank (Owner)</option>
                <option value="steve@restorationdoctors.com">Steve</option>
                <option value="katherine@restorationdoctors.com">Katherine</option>
                <option value="mark@flood.doctor">Mark</option>
                <option value="shyon@restorationdoctors.com">Shayan</option>
                <option value="dom@flood.doctor">Dom</option>
              </select>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* Top Metrics Strip */}
        <section
          aria-label="Board summary metrics"
          className="grid grid-cols-2 sm:grid-cols-4 gap-3"
        >
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Open Cards
            </span>
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5">
              {summaryStats.openCount}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
              ⚡ Ready to Close
            </span>
            <div className="text-2xl font-extrabold text-emerald-800 tabular-nums mt-0.5">
              {summaryStats.readyCount}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-red-600">
              Urgent
            </span>
            <div className="text-2xl font-extrabold text-red-600 tabular-nums mt-0.5">
              {summaryStats.urgentCount}
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Assigned
            </span>
            <div className="text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5">
              {summaryStats.assignedCount}
            </div>
          </div>
        </section>

        {activeTab === 'board' ? (
          <BoardView
            items={enrichedItems}
            team={team}
            viewer={viewer}
            threadIds={threadIds}
            loading={loadingBoard}
            onRefresh={loadBoardData}
            onCardDone={handleCardDone}
            onCardReopen={handleCardReopen}
            onCardAssign={handleCardAssign}
            onCardSnooze={handleCardSnooze}
            onCardUrgent={handleCardUrgent}
            onCardStageChange={handleCardStageChange}
            onAutoCloseHandled={handleAutoCloseHandled}
            onBulkDone={handleBulkDone}
            onMergeClaimDuplicates={handleMergeClaimDuplicates}
            onOpenEmailThread={handleOpenEmailThread}
          />
        ) : (
          /* Shared To-Do v2 View with Canonical Client Grouping & Show Completed Toggle */
          <section aria-label="Shared To-Do v2" className="space-y-4">
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Shared Team To-Do List (v2)</h2>
                <p className="text-xs text-slate-500">
                  Near-duplicate client spellings are automatically consolidated into unified client sections.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowCompletedTodos(!showCompletedTodos)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                  showCompletedTodos
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {showCompletedTodos
                  ? `Hide completed (${todos.filter((t) => t.done).length})`
                  : `Show completed (${todos.filter((t) => t.done).length})`}
              </button>
            </div>

            {/* Add To-Do Form */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newTodoText.trim()) return;
                const taskId = `task-${Date.now().toString(16).padStart(14, '0').slice(-14)}`;
                try {
                  await submitTodoAction(taskId, 'add', {
                    item: {
                      id: taskId,
                      text: newTodoText.trim(),
                      client: newTodoClient.trim() || 'General',
                      section: newTodoClient.trim() || 'General',
                      assignee: newTodoAssignee,
                    },
                  });
                  setNewTodoText('');
                  setNewTodoClient('');
                  showToast('Added team task');
                } catch (err: any) {
                  showToast(err?.message || 'Could not add task', true);
                }
              }}
              className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs flex flex-wrap items-center gap-2"
            >
              <input
                type="text"
                value={newTodoText}
                onChange={(e) => setNewTodoText(e.target.value)}
                placeholder="Add a new operational task..."
                className="flex-1 min-w-[220px] px-3 py-1.5 rounded-lg text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <input
                type="text"
                value={newTodoClient}
                onChange={(e) => setNewTodoClient(e.target.value)}
                placeholder="Client or Claim (e.g. Robert Badgett)"
                className="w-52 px-3 py-1.5 rounded-lg text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <select
                value={newTodoAssignee}
                onChange={(e) => setNewTodoAssignee(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-50 border border-slate-200 text-slate-700"
              >
                <option value="">Unassigned</option>
                {team.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Task
              </button>
            </form>

            {/* Grouped Client Sections */}
            <div className="space-y-3">
              {groupedTodos.map((group) => (
                <div
                  key={group.key}
                  className="rounded-xl bg-white border border-slate-200 shadow-2xs overflow-hidden"
                >
                  <header className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-900">{group.label}</h3>
                    <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
                      {group.items.length} {group.items.length === 1 ? 'task' : 'tasks'}
                    </span>
                  </header>
                  <div className="divide-y divide-slate-100">
                    {group.items.map((item) => (
                      <div
                        key={item.id}
                        className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-slate-50/60"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await submitTodoAction(item.id, 'toggle', { done: !item.done });
                                showToast(
                                  item.done ? 'Reopened task' : 'Completed task'
                                );
                              } catch (err: any) {
                                showToast(err?.message || 'Could not toggle task', true);
                              }
                            }}
                            className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center text-xs font-bold border transition-colors cursor-pointer ${
                              item.done
                                ? 'bg-emerald-600 text-white border-emerald-600'
                                : 'bg-white text-slate-400 border-slate-300 hover:border-emerald-500'
                            }`}
                          >
                            {item.done ? '✓' : ''}
                          </button>
                          <div className="min-w-0">
                            <p
                              className={`text-sm font-semibold ${
                                item.done ? 'line-through text-slate-400' : 'text-slate-900'
                              }`}
                            >
                              {item.text}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {item.client && (
                                <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600">
                                  Client: {item.client}
                                </span>
                              )}
                              {item.sourceAccount && (
                                <span className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-600">
                                  {item.sourceAccount}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <select
                          aria-label={`Assign ${item.text}`}
                          value={String(item.assignee || '').toLowerCase()}
                          onChange={async (e) => {
                            try {
                              await submitTodoAction(item.id, 'assign', {
                                assignee: e.target.value,
                              });
                              showToast('Updated task owner');
                            } catch (err: any) {
                              showToast(err?.message || 'Could not assign task', true);
                            }
                          }}
                          className="px-2 py-1 rounded text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-700 cursor-pointer"
                        >
                          <option value="">Unassigned</option>
                          {team.map((m) => (
                            <option key={m.key} value={m.key}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Email Thread Modal */}
      {activeThreadCard && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-2xl w-full max-h-[82vh] flex flex-col overflow-hidden">
            <header className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <span className="text-xs font-mono font-bold text-slate-500">
                  Card #{activeThreadCard.id} · Email Thread
                </span>
                <h3 className="text-sm font-bold text-slate-900">
                  {activeThreadData?.subject || cardTitle(activeThreadCard)}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setActiveThreadCard(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </header>
            <div className="p-5 overflow-y-auto space-y-3 flex-1">
              {loadingThread ? (
                <p className="text-xs text-slate-500">Loading email messages...</p>
              ) : activeThreadData?.messages?.length ? (
                activeThreadData.messages.map((msg, i) => (
                  <div key={i} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
                      <span className="text-slate-800">{msg.from}</span>
                      <span>{new Date(msg.date).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {msg.body}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">No messages stored for this card.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5-Second Undo Toast */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-3 px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold text-white transition-all ${
            toast.isError ? 'bg-red-800' : 'bg-slate-900'
          }`}
        >
          <span>{toast.message}</span>
          {toast.onUndo && (
            <button
              type="button"
              onClick={() => {
                const fn = toast.onUndo;
                setToast(null);
                fn?.();
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white/15 hover:bg-white/25 text-white font-bold cursor-pointer"
            >
              <Undo2 className="w-3 h-3" />
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
