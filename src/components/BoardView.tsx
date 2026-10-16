import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArchiveRestore,
  Building2,
  CheckCircle2,
  Clock,
  Command,
  DollarSign,
  FolderGit2,
  Inbox,
  Keyboard,
  Layers,
  Mail,
  MoreHorizontal,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  UserCheck,
  Users,
  X,
  Zap,
} from 'lucide-react';

export interface BriefTurn {
  by: string;
  at: string;
  what: string;
}

export interface CardBrief {
  title?: string;
  client?: string;
  claim?: string;
  action?: string;
  needs?: string;
  next_step?: string;
  waiting_on?: string;
  owner_hint?: string;
  deadline?: string;
  deadline_note?: string;
  amount?: string;
  phone?: string;
  counsel_only?: boolean;
  looks_done?: boolean;
  last_ours?: BriefTurn | null;
  last_theirs?: BriefTurn | null;
  messages?: number;
  generated_at?: string;
}

export interface CommandReceipt {
  id: number;
  operation: string;
  state: 'queued' | 'received' | 'applied' | 'acked' | 'failed' | 'expired' | string;
  created_at?: string;
  error?: string;
}

export interface BoardCardItem {
  id: number;
  title: string;
  summary?: string;
  status?: 'open' | 'snoozed' | 'done' | 'in_progress' | string;
  stage?: 'open' | 'in_progress' | 'resolved';
  priority?: number | string;
  urgent?: string | boolean;
  assignee?: string;
  due?: string;
  created?: string;
  updated?: string;
  kind?: string;
  mailbox?: string;
  source_account?: string;
  thread_id?: string;
  source_url?: string;
  auto_resolved_candidate?: boolean;
  claim_group?: string;
  claim_label?: string;
  pending?: boolean;
  command_receipt?: CommandReceipt | null;
  brief?: CardBrief | null;
  history?: Array<{ at: string; who: string; what: string; ours?: boolean; kind?: string }>;
  notes?: Array<{ at: string; by: string; text: string }>;
  aries_task?: { status: string; at: string; finished_at?: string };
  prep?: { status: string; at: string; finished_at?: string };
}

export interface TeamMember {
  key: string;
  name: string;
}

export type KanbanStatus = 'Open' | 'In Progress' | 'Resolved';
export type KanbanSortOption = 'urgent' | 'created' | 'assignee';

export interface BoardViewProps {
  items: BoardCardItem[];
  team: TeamMember[];
  viewer: TeamMember | null;
  threadIds: Set<number>;
  loading?: boolean;
  onRefresh: () => void;
  onCardDone: (card: BoardCardItem, reason?: string) => Promise<void>;
  onCardReopen: (card: BoardCardItem) => Promise<void>;
  onCardAssign: (card: BoardCardItem, ownerKey: string) => Promise<void>;
  onCardSnooze: (card: BoardCardItem, isoDate: string) => Promise<void>;
  onCardUrgent: (card: BoardCardItem, urgent: boolean) => Promise<void>;
  onCardStageChange: (card: BoardCardItem, targetColumn: KanbanStatus) => Promise<void>;
  onAutoCloseHandled: (ids?: number[]) => Promise<void>;
  onBulkDone: (ids: number[]) => Promise<void>;
  onMergeClaimDuplicates: (groupMembers: BoardCardItem[]) => Promise<void>;
  onOpenEmailThread: (card: BoardCardItem) => void;
  onRetryCommand?: (commandId: number, cardId: number) => Promise<void>;
  onOpenCommandPalette?: () => void;
}

const DONE_REASONS = [
  { key: 'replied', label: 'Replied in email' },
  { key: 'paid', label: 'Invoice paid' },
  { key: 'called', label: 'Called client/adjuster' },
  { key: 'handled another way', label: 'Handled another way' },
  { key: 'nothing was needed', label: 'Nothing needed' },
];

export function cleanSubject(text?: string): string {
  let title = String(text || '').trim();
  for (let pass = 0; pass < 8; pass += 1) {
    const lower = title.toLowerCase();
    const prefix = ['re:', 'fw:', 'fwd:'].find((word) => lower.startsWith(word));
    const close = title.indexOf(']');
    if (prefix) title = title.slice(prefix.length).trim();
    else if (title.startsWith('[') && close > 0 && close < 26) title = title.slice(close + 1).trim();
    else break;
  }
  return title || String(text || '');
}

export function cardTitle(item: BoardCardItem): string {
  return item.brief?.title || cleanSubject(item.title);
}

export function isUrgentCard(item: BoardCardItem): boolean {
  return Boolean(item.urgent) || String(item.priority || '').toLowerCase() === 'urgent' || item.priority === 1;
}

export function isAutoResolved(item: BoardCardItem): boolean {
  if ((item.status || 'open') === 'done') return false;
  if (item.auto_resolved_candidate === true) return true;
  const brief = item.brief || {};
  if (brief.action === 'close' || brief.looks_done === true) return true;
  const oursAt = brief.last_ours?.at ? Date.parse(brief.last_ours.at) : NaN;
  const theirsAt = brief.last_theirs?.at ? Date.parse(brief.last_theirs.at) : NaN;
  if (Number.isFinite(oursAt) && Number.isFinite(theirsAt) && oursAt > theirsAt && brief.action !== 'follow_up') {
    return true;
  }
  return false;
}

export function getCardAgeDays(item: BoardCardItem): number {
  const raw = String(item.created || item.updated || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 0;
  const createdMs = Date.parse(`${raw}T00:00:00Z`);
  if (!Number.isFinite(createdMs)) return 0;
  return Math.max(0, Math.round((Date.now() - createdMs) / 86400000));
}

export function isStaleCard(item: BoardCardItem): boolean {
  if ((item.status || 'open') !== 'open') return false;
  return getCardAgeDays(item) > 7;
}

export function parseDollarAmount(raw?: string): number {
  if (!raw) return 0;
  const cleaned = String(raw).replace(/[^0-9.]/g, '');
  const val = Number.parseFloat(cleaned);
  return Number.isFinite(val) ? val : 0;
}

export function detectCarrier(item: BoardCardItem): string {
  const brief = item.brief || {};
  const haystack = [
    item.title,
    brief.title,
    brief.waiting_on,
    brief.deadline_note,
    brief.last_theirs?.by,
    brief.last_theirs?.what,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (haystack.includes('state farm')) return 'State Farm';
  if (haystack.includes('travelers')) return 'Travelers';
  if (haystack.includes('usaa')) return 'USAA';
  if (haystack.includes('liberty mutual')) return 'Liberty Mutual';
  if (haystack.includes('allstate')) return 'Allstate';
  if (haystack.includes('nationwide')) return 'Nationwide';
  if (haystack.includes('erie')) return 'Erie Insurance';
  if (haystack.includes('chubb')) return 'Chubb';
  return 'Direct / Other';
}

export function getSlaStatus(item: BoardCardItem): {
  label: string;
  tone: 'red' | 'amber' | 'slate' | null;
} {
  if (item.status === 'done' || isAutoResolved(item)) return { label: '', tone: null };
  const brief = item.brief || {};
  const waitingOn = String(brief.waiting_on || '').toLowerCase();
  const waitingOnUs =
    !waitingOn || /frank|mark|steve|katherine|shayan|shyon|dom|aries|office|us\b/i.test(waitingOn);
  const ageDays = getCardAgeDays(item);

  if (waitingOnUs) {
    if (ageDays > 7) return { label: `SLA > 7d (${ageDays}d) · Escalate`, tone: 'red' };
    if (ageDays >= 2) return { label: `SLA > 48h (${ageDays}d) · Waiting on Us`, tone: 'amber' };
    return { label: 'Waiting on Us', tone: 'amber' };
  }
  return { label: `Awaiting ${brief.waiting_on}`, tone: 'slate' };
}

export function formatMailboxPill(item: BoardCardItem): string {
  const raw = String(item.mailbox || item.source_account || '').trim().toLowerCase();
  if (!raw) {
    const m = /^\[([a-z0-9._-]+?)(?:\s+inbox)?\]/i.exec(String(item.title || '').trim());
    return m ? m[1].toLowerCase() : '';
  }
  const at = raw.indexOf('@');
  return at > 0 ? raw.slice(0, at + 1) : raw;
}

export function deriveKanbanColumn(item: BoardCardItem): KanbanStatus {
  if (item.stage === 'resolved' || item.status === 'done') {
    return 'Resolved';
  }
  if (item.stage === 'in_progress' || item.status === 'in_progress') {
    return 'In Progress';
  }
  if (item.stage === 'open') {
    return 'Open';
  }
  if (isAutoResolved(item)) {
    return 'Resolved';
  }
  const hasOwner = Boolean(String(item.assignee || '').trim());
  const hasActiveTask = Boolean(item.aries_task?.status || item.prep?.status);
  const waitingOn = String(item.brief?.waiting_on || '').toLowerCase();
  const waitingExternal = Boolean(waitingOn && !/^(us|frank|mark|steve|katherine|shayan|shyon|dom|office)$/i.test(waitingOn));
  if (hasOwner || hasActiveTask || waitingExternal) {
    return 'In Progress';
  }
  return 'Open';
}

export function getAccentBorderClass(item: BoardCardItem, column: KanbanStatus): string {
  if (column === 'Resolved' || isAutoResolved(item) || item.status === 'done') {
    return 'border-l-4 border-l-emerald-600';
  }
  if (isUrgentCard(item)) {
    return 'border-l-4 border-l-red-600';
  }
  const waitingOn = String(item.brief?.waiting_on || '').toLowerCase();
  if (item.brief?.action === 'wait' || (waitingOn && !/frank|mark|steve|katherine|shayan|shyon|dom|aries|office|us\b/i.test(waitingOn))) {
    return 'border-l-4 border-l-slate-400';
  }
  return 'border-l-4 border-l-amber-500';
}

function isoDateDaysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const BoardView: React.FC<BoardViewProps> = ({
  items,
  team,
  viewer,
  threadIds,
  loading = false,
  onRefresh,
  onCardDone,
  onCardReopen,
  onCardAssign,
  onCardSnooze,
  onCardUrgent,
  onCardStageChange,
  onAutoCloseHandled,
  onBulkDone,
  onMergeClaimDuplicates,
  onOpenEmailThread,
  onRetryCommand,
  onOpenCommandPalette,
}) => {
  const [quickFilter, setQuickFilter] = useState<'all' | 'mine' | 'ready' | 'urgent' | 'unassigned' | 'stale'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [carrierFilter, setCarrierFilter] = useState('');
  const [sortBy, setSortBy] = useState<KanbanSortOption>('urgent');
  const [groupByClaim, setGroupByClaim] = useState(true);
  const [showFinancialRollup, setShowFinancialRollup] = useState(true);
  const [showRecoveryDrawer, setShowRecoveryDrawer] = useState(false);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [focusedCardId, setFocusedCardId] = useState<number | null>(null);
  const [openMenuCardId, setOpenMenuCardId] = useState<number | null>(null);
  const [openSnoozeCardId, setOpenSnoozeCardId] = useState<number | null>(null);
  const [draggedCardId, setDraggedCardId] = useState<number | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<KanbanStatus | null>(null);
  const [dragOverOwner, setDragOverOwner] = useState<string | null>(null);

  const activeItems = useMemo(() => items.filter((item) => item.status !== 'snoozed'), [items]);
  const snoozedItems = useMemo(() => items.filter((item) => item.status === 'snoozed'), [items]);
  const completedItems = useMemo(() => items.filter((item) => item.status === 'done'), [items]);

  const counts = useMemo(() => {
    const open = activeItems.filter((i) => i.status !== 'done');
    return {
      total: open.length,
      mine: viewer ? open.filter((i) => String(i.assignee || '').toLowerCase() === viewer.key).length : 0,
      ready: open.filter((i) => isAutoResolved(i)).length,
      urgent: open.filter((i) => isUrgentCard(i)).length,
      unassigned: open.filter((i) => !String(i.assignee || '').trim()).length,
      stale: open.filter((i) => isStaleCard(i)).length,
    };
  }, [activeItems, viewer]);

  // Enhancement 2: Team Workload & SLA Heatmap metrics
  const teamWorkload = useMemo(() => {
    const open = activeItems.filter((i) => i.status !== 'done');
    const roster = [
      { key: '__unassigned__', name: 'Unassigned' },
      ...team,
      { key: 'aries', name: 'Aries AI' },
    ];
    return roster.map((member) => {
      const assignedCards = open.filter((card) => {
        const owner = String(card.assignee || '').trim().toLowerCase();
        return member.key === '__unassigned__' ? owner === '' : owner === member.key.toLowerCase();
      });
      const urgentCount = assignedCards.filter(isUrgentCard).length;
      const slaBreachCount = assignedCards.filter((c) => getSlaStatus(c).tone === 'red').length;
      return {
        ...member,
        count: assignedCards.length,
        urgentCount,
        slaBreachCount,
      };
    });
  }, [activeItems, team]);

  // Enhancement 4: Financial & Carrier Exposure Roll-Up
  const financialRollup = useMemo(() => {
    const open = activeItems.filter((i) => i.status !== 'done');
    let totalOpenExposure = 0;
    let readyToCloseValue = 0;
    let urgentExposure = 0;
    const byCarrier = new Map<string, { carrier: string; amount: number; count: number; urgentCount: number }>();

    for (const card of open) {
      const amt = parseDollarAmount(card.brief?.amount);
      totalOpenExposure += amt;
      if (isAutoResolved(card)) readyToCloseValue += amt;
      if (isUrgentCard(card)) urgentExposure += amt;

      const carrier = detectCarrier(card);
      const current = byCarrier.get(carrier) || { carrier, amount: 0, count: 0, urgentCount: 0 };
      current.amount += amt;
      current.count += 1;
      if (isUrgentCard(card)) current.urgentCount += 1;
      byCarrier.set(carrier, current);
    }

    return {
      totalOpenExposure,
      readyToCloseValue,
      urgentExposure,
      carriers: Array.from(byCarrier.values()).sort((a, b) => b.amount - a.amount),
    };
  }, [activeItems]);

  const filteredItems = useMemo(() => {
    return activeItems.filter((item) => {
      const owner = String(item.assignee || '').toLowerCase();
      if (quickFilter === 'mine' && (!viewer || owner !== viewer.key)) return false;
      if (quickFilter === 'ready' && !isAutoResolved(item)) return false;
      if (quickFilter === 'urgent' && !isUrgentCard(item)) return false;
      if (quickFilter === 'unassigned' && owner !== '') return false;
      if (quickFilter === 'stale' && !isStaleCard(item)) return false;

      if (ownerFilter === '__unassigned__' && owner !== '') return false;
      if (ownerFilter && ownerFilter !== '__unassigned__' && owner !== ownerFilter.toLowerCase()) return false;

      if (carrierFilter && detectCarrier(item) !== carrierFilter) return false;

      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;
      const brief = item.brief || {};
      const haystack = [
        `#${item.id}`,
        item.title,
        brief.title,
        brief.client,
        brief.claim,
        brief.next_step,
        brief.waiting_on,
        brief.amount,
        item.mailbox,
        item.source_account,
        item.claim_label,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [activeItems, quickFilter, ownerFilter, carrierFilter, searchQuery, viewer]);

  const columnsData = useMemo(() => {
    const map: Record<KanbanStatus, BoardCardItem[]> = {
      Open: [],
      'In Progress': [],
      Resolved: [],
    };
    for (const item of filteredItems) {
      const col = deriveKanbanColumn(item);
      map[col].push(item);
    }

    const ownerNameMap = new Map(team.map((m) => [m.key.toLowerCase(), m.name.toLowerCase()]));
    const getCreatedTime = (card: BoardCardItem): number => {
      const raw = card.created || card.updated || '';
      const parsed = raw ? Date.parse(raw) : NaN;
      return Number.isFinite(parsed) ? parsed : card.id;
    };
    const getAssigneeLabel = (card: BoardCardItem): string => {
      const key = String(card.assignee || '').trim().toLowerCase();
      if (!key) return '\uffff';
      return ownerNameMap.get(key) || key;
    };

    for (const col of ['Open', 'In Progress', 'Resolved'] as KanbanStatus[]) {
      map[col].sort((a, b) => {
        if (sortBy === 'created') {
          const timeDiff = getCreatedTime(b) - getCreatedTime(a);
          if (timeDiff !== 0) return timeDiff;
          return b.id - a.id;
        }
        if (sortBy === 'assignee') {
          const ownerA = getAssigneeLabel(a);
          const ownerB = getAssigneeLabel(b);
          const cmp = ownerA.localeCompare(ownerB);
          if (cmp !== 0) return cmp;
          const urgDiff = Number(isUrgentCard(b)) - Number(isUrgentCard(a));
          if (urgDiff !== 0) return urgDiff;
          return b.id - a.id;
        }
        const urgDiff = Number(isUrgentCard(b)) - Number(isUrgentCard(a));
        if (urgDiff !== 0) return urgDiff;
        const timeDiff = getCreatedTime(b) - getCreatedTime(a);
        if (timeDiff !== 0) return timeDiff;
        return b.id - a.id;
      });
    }
    return map;
  }, [filteredItems, sortBy, team]);

  const orderedVisibleCards = useMemo(() => {
    return [...columnsData.Open, ...columnsData['In Progress'], ...columnsData.Resolved];
  }, [columnsData]);

  // Enhancement 1: Linear-style Keyboard Shortcuts (J/K, D/E, U, S, M/Enter, ?)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '?') {
        e.preventDefault();
        setShowKeyboardHelp((prev) => !prev);
        return;
      }

      if (!orderedVisibleCards.length) return;
      const currentIdx = focusedCardId
        ? orderedVisibleCards.findIndex((c) => c.id === focusedCardId)
        : -1;

      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        const nextIdx = currentIdx < orderedVisibleCards.length - 1 ? currentIdx + 1 : 0;
        setFocusedCardId(orderedVisibleCards[nextIdx].id);
        return;
      }
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        const prevIdx = currentIdx > 0 ? currentIdx - 1 : orderedVisibleCards.length - 1;
        setFocusedCardId(orderedVisibleCards[prevIdx].id);
        return;
      }

      const activeCard =
        (focusedCardId && orderedVisibleCards.find((c) => c.id === focusedCardId)) ||
        orderedVisibleCards[0];
      if (!activeCard) return;

      if (e.key === 'd' || e.key === 'D' || e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        if (activeCard.status !== 'done') onCardDone(activeCard);
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        onCardUrgent(activeCard, !isUrgentCard(activeCard));
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        onCardSnooze(activeCard, isoDateDaysFromNow(1));
      } else if (e.key === 'm' || e.key === 'M' || e.key === 'Enter') {
        e.preventDefault();
        onOpenEmailThread(activeCard);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [orderedVisibleCards, focusedCardId, onCardDone, onCardUrgent, onCardSnooze, onOpenEmailThread]);

  const claimGroupsMap = useMemo(() => {
    const map = new Map<string, BoardCardItem[]>();
    for (const item of activeItems) {
      if (item.status === 'done') continue;
      if (item.claim_group) {
        if (!map.has(item.claim_group)) map.set(item.claim_group, []);
        map.get(item.claim_group)!.push(item);
      }
    }
    return map;
  }, [activeItems]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: number) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDropOnColumn = async (targetColumn: KanbanStatus) => {
    setDragOverColumn(null);
    if (draggedCardId === null) return;
    const card = items.find((i) => i.id === draggedCardId);
    setDraggedCardId(null);
    if (!card) return;
    await onCardStageChange(card, targetColumn);
  };

  const handleDropOnOwnerPill = async (ownerKey: string) => {
    setDragOverOwner(null);
    if (draggedCardId === null) return;
    const card = items.find((i) => i.id === draggedCardId);
    setDraggedCardId(null);
    if (!card) return;
    const targetOwner = ownerKey === '__unassigned__' ? '' : ownerKey;
    await onCardAssign(card, targetOwner);
  };

  const renderSyncReceiptBadge = (item: BoardCardItem) => {
    const receipt = item.command_receipt;
    if (!receipt) return null;
    const state = receipt.state;
    if (state === 'failed' || state === 'expired') {
      return (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
          <span className="w-1.5 h-1.5 rounded-full bg-red-600" />
          Sync {state}
          {onRetryCommand && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRetryCommand(receipt.id, item.id);
              }}
              className="ml-1 underline hover:text-red-900 cursor-pointer"
            >
              Retry
            </button>
          )}
        </span>
      );
    }
    if (state === 'queued' || state === 'received') {
      return (
        <span
          title={`Command #${receipt.id} (${receipt.operation}) is ${state} in D1`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          {state === 'queued' ? 'Queued in D1' : 'Leased by Aries'}
        </span>
      );
    }
    return (
      <span
        title={`Command #${receipt.id} applied`}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Synced
      </span>
    );
  };

  const renderCard = (item: BoardCardItem, column: KanbanStatus) => {
    const brief = item.brief || {};
    const resolvedCandidate = isAutoResolved(item);
    const isDone = item.status === 'done';
    const urgent = isUrgentCard(item);
    const ageDays = getCardAgeDays(item);
    const mailboxPill = formatMailboxPill(item);
    const isExpanded = expandedCards.has(item.id);
    const isSelected = selectedIds.has(item.id);
    const isFocused = focusedCardId === item.id;
    const hasEmail = threadIds.has(item.id);
    const groupSiblings = item.claim_group ? claimGroupsMap.get(item.claim_group) || [] : [];
    const sla = getSlaStatus(item);

    return (
      <article
        key={item.id}
        draggable
        onClick={() => setFocusedCardId(item.id)}
        onDragStart={() => setDraggedCardId(item.id)}
        onDragEnd={() => {
          setDraggedCardId(null);
          setDragOverColumn(null);
          setDragOverOwner(null);
        }}
        data-id={item.id}
        data-status={item.status || 'open'}
        className={`group relative rounded-lg bg-white border transition-all ${getAccentBorderClass(
          item,
          column
        )} ${
          isFocused
            ? 'border-blue-500 ring-2 ring-blue-500/30 shadow-sm'
            : 'border-slate-200 shadow-2xs hover:border-slate-300'
        } ${isDone ? 'opacity-75 bg-slate-50/70' : ''}`}
      >
        <div className="p-3.5 space-y-2.5">
          {/* Card Header: #ID · Client/Claim · Mailbox Pill · Amount · Owner Dropdown */}
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSelect(item.id)}
                aria-label={`Select card #${item.id}`}
                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="font-mono text-xs font-bold text-slate-600 tabular-nums">#{item.id}</span>

              {(brief.client || brief.claim || item.claim_label) && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200/80 truncate max-w-[200px]">
                  {brief.client || item.claim_label}
                  {brief.claim ? ` · ${/^(invoice|claim)/i.test(brief.claim) ? brief.claim : `Claim ${brief.claim}`}` : ''}
                </span>
              )}

              {brief.amount && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 tabular-nums">
                  {brief.amount}
                </span>
              )}

              {mailboxPill && (
                <span
                  title={`Source mailbox: ${item.mailbox || item.source_account || mailboxPill}`}
                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold bg-slate-100 text-slate-700 border border-slate-200"
                >
                  {mailboxPill}
                </span>
              )}

              {resolvedCandidate && !isDone && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3 h-3" />
                  Handled in email
                </span>
              )}

              {renderSyncReceiptBadge(item)}
            </div>

            {/* Inline Owner Selector Dropdown right in header */}
            <div className="flex items-center gap-1">
              <select
                aria-label={`Owner for card #${item.id}`}
                value={String(item.assignee || '').toLowerCase()}
                onChange={(e) => onCardAssign(item, e.target.value)}
                className="h-6 px-1.5 rounded text-xs font-semibold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="">Unassigned</option>
                {team.map((member) => (
                  <option key={member.key} value={member.key}>
                    {member.name}
                  </option>
                ))}
                <option value="aries">Aries (AI)</option>
              </select>

              <button
                type="button"
                onClick={() => onCardUrgent(item, !urgent)}
                title={urgent ? 'Remove urgent flag' : 'Mark urgent'}
                className={`px-1.5 py-0.5 rounded text-[11px] font-semibold border transition-colors cursor-pointer ${
                  urgent
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-slate-500 border-slate-200 hover:text-red-600 hover:border-red-200'
                }`}
              >
                {urgent ? 'Urgent' : '!'}
              </button>
            </div>
          </div>

          {/* Card Body: Bold cleaned title + 1-line Next Step box */}
          <div>
            <h4
              onClick={() => onOpenEmailThread(item)}
              className={`text-sm font-semibold text-slate-900 leading-snug cursor-pointer hover:text-blue-700 ${
                isDone ? 'line-through text-slate-500' : ''
              }`}
            >
              {cardTitle(item)}
            </h4>

            {brief.next_step && (
              <div className="mt-1.5 px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-200/80 text-xs text-slate-700 line-clamp-2">
                <span className="font-semibold text-slate-900">Next: </span>
                {brief.next_step}
              </div>
            )}
          </div>

          {/* Metadata Strip: Age / Deadline / SLA Escalation Badge */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 font-medium">
            <div className="flex flex-wrap items-center gap-1.5">
              {brief.deadline || item.due ? (
                <span className="inline-flex items-center gap-1 text-amber-700 font-semibold tabular-nums">
                  <Clock className="w-3 h-3" />
                  Due {brief.deadline || item.due}
                </span>
              ) : (
                <span className={`tabular-nums ${ageDays > 7 ? 'text-amber-700 font-semibold' : ''}`}>
                  Open {ageDays}d
                </span>
              )}

              {sla.tone && (
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                    sla.tone === 'red'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : sla.tone === 'amber'
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                >
                  {sla.label}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => toggleExpand(item.id)}
              className="text-slate-400 hover:text-slate-700 font-semibold cursor-pointer"
            >
              {isExpanded ? 'Hide details ▴' : 'Details ▾'}
            </button>
          </div>

          {/* Expanded Details Drawer */}
          {isExpanded && (
            <div className="pt-2.5 border-t border-slate-100 space-y-2 text-xs text-slate-600">
              {brief.last_theirs && (
                <div className="p-2 rounded bg-slate-50 border border-slate-200/60">
                  <span className="font-semibold text-slate-800">Last inbound ({brief.last_theirs.by}): </span>
                  {brief.last_theirs.what}
                </div>
              )}
              {brief.last_ours && (
                <div className="p-2 rounded bg-emerald-50/50 border border-emerald-200/60">
                  <span className="font-semibold text-emerald-900">Our last reply ({brief.last_ours.by}): </span>
                  {brief.last_ours.what}
                </div>
              )}
              {item.history && item.history.length > 0 && (
                <div className="space-y-1">
                  <div className="font-semibold text-slate-700">Recent activity:</div>
                  {item.history.slice(0, 3).map((h, i) => (
                    <div key={i} className="text-[11px] text-slate-500">
                      <span className="font-medium text-slate-700">{h.who}:</span> {h.what}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Collapsed-Ready Quick Actions Bar (1-Click Done, Snooze, Inspector/Email, Stage Move, More) */}
          <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5">
            <div className="flex flex-wrap items-center gap-1">
              {!isDone ? (
                <button
                  type="button"
                  onClick={() => onCardDone(item)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors cursor-pointer"
                >
                  ✓ Done
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onCardReopen(item)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-800 transition-colors cursor-pointer"
                >
                  ↺ Reopen
                </button>
              )}

              {/* Snooze Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenSnoozeCardId(openSnoozeCardId === item.id ? null : item.id)}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors cursor-pointer"
                >
                  Snooze ▾
                </button>
                {openSnoozeCardId === item.id && (
                  <div className="absolute left-0 bottom-full mb-1 z-20 w-36 rounded-lg bg-white border border-slate-200 shadow-lg py-1 text-xs">
                    {[
                      { label: 'Tomorrow', days: 1 },
                      { label: 'In 3 days', days: 3 },
                      { label: 'Next week', days: 7 },
                    ].map((opt) => (
                      <button
                        key={opt.days}
                        type="button"
                        onClick={() => {
                          setOpenSnoozeCardId(null);
                          onCardSnooze(item, isoDateDaysFromNow(opt.days));
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-50 font-medium text-slate-700 cursor-pointer"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Split-Pane Email & Claim Inspector Button */}
              <button
                type="button"
                onClick={() => onOpenEmailThread(item)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                  hasEmail
                    ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200/70'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200/70'
                }`}
              >
                <Mail className="w-3 h-3" />
                {hasEmail ? '✉️ Email' : 'Inspect'}
              </button>
            </div>

            {/* Stage Transition & More Menu */}
            <div className="flex items-center gap-1">
              {column !== 'In Progress' && !isDone && (
                <button
                  type="button"
                  onClick={() => onCardStageChange(item, 'In Progress')}
                  title="Move to In Progress"
                  className="px-2 py-1 rounded text-[11px] font-semibold text-slate-600 hover:bg-slate-100 border border-transparent hover:border-slate-200 cursor-pointer"
                >
                  → In Progress
                </button>
              )}
              {column === 'In Progress' && (
                <button
                  type="button"
                  onClick={() => onCardStageChange(item, 'Open')}
                  title="Move back to Open"
                  className="px-2 py-1 rounded text-[11px] font-semibold text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  ← Open
                </button>
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setOpenMenuCardId(openMenuCardId === item.id ? null : item.id)}
                  aria-label="More card actions"
                  className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </button>
                {openMenuCardId === item.id && (
                  <div className="absolute right-0 bottom-full mb-1 z-20 w-48 rounded-lg bg-white border border-slate-200 shadow-lg py-1 text-xs">
                    <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Done with reason
                    </div>
                    {DONE_REASONS.map((r) => (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => {
                          setOpenMenuCardId(null);
                          onCardDone(item, r.key);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-slate-700 font-medium cursor-pointer"
                      >
                        ✓ {r.label}
                      </button>
                    ))}
                    {groupSiblings.length > 1 && (
                      <>
                        <div className="my-1 border-t border-slate-100" />
                        <button
                          type="button"
                          onClick={() => {
                            setOpenMenuCardId(null);
                            onMergeClaimDuplicates(groupSiblings);
                          }}
                          className="w-full text-left px-3 py-1.5 hover:bg-amber-50 text-amber-800 font-semibold cursor-pointer"
                        >
                          Merge & Close Older ({groupSiblings.length - 1})
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </article>
    );
  };

  const renderColumnContent = (column: KanbanStatus, colItems: BoardCardItem[]) => {
    if (!colItems.length) {
      return (
        <div className="flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50/50">
          <p className="text-xs font-semibold text-slate-500">No cards in {column}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {column === 'Open'
              ? 'New unassigned items appear here.'
              : column === 'In Progress'
                ? 'Assigned or active claim items appear here.'
                : 'Handled threads and completed items appear here.'}
          </p>
        </div>
      );
    }

    if (!groupByClaim) {
      return colItems.map((item) => renderCard(item, column));
    }

    const renderedGroups = new Set<string>();
    const elements: React.ReactNode[] = [];

    for (const item of colItems) {
      const groupKey = item.claim_group;
      if (!groupKey) {
        elements.push(renderCard(item, column));
        continue;
      }
      if (renderedGroups.has(groupKey)) continue;
      renderedGroups.add(groupKey);

      const membersInCol = colItems.filter((i) => i.claim_group === groupKey);
      const allGroupMembers = claimGroupsMap.get(groupKey) || membersInCol;

      if (membersInCol.length === 1 && allGroupMembers.length <= 1) {
        elements.push(renderCard(item, column));
        continue;
      }

      elements.push(
        <div
          key={groupKey}
          className="rounded-xl border border-blue-200/90 bg-blue-50/35 p-2.5 space-y-2 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-1.5 px-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <FolderGit2 className="w-3.5 h-3.5 text-blue-700 shrink-0" />
              <span className="text-xs font-bold text-slate-900 truncate">
                {item.claim_label || item.brief?.client || cardTitle(item)}
              </span>
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 tabular-nums">
                {allGroupMembers.length} tasks
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => onBulkDone(allGroupMembers.map((m) => m.id))}
                className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              >
                ✓ Complete All ({allGroupMembers.length})
              </button>
              <select
                aria-label={`Assign all cards in ${item.claim_label || groupKey}`}
                defaultValue=""
                onChange={async (e) => {
                  const val = e.target.value;
                  if (!val) return;
                  e.target.value = '';
                  const ownerKey = val === '__unassigned__' ? '' : val;
                  for (const member of allGroupMembers) {
                    await onCardAssign(member, ownerKey);
                  }
                }}
                className="h-5 px-1.5 rounded text-[11px] font-semibold bg-white hover:bg-slate-50 text-slate-800 border border-blue-200 cursor-pointer"
              >
                <option value="">Assign All...</option>
                {team.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.name}
                  </option>
                ))}
                <option value="aries">Aries (AI)</option>
                <option value="__unassigned__">Unassigned</option>
              </select>
              {allGroupMembers.length > 1 && (
                <button
                  type="button"
                  onClick={() => onMergeClaimDuplicates(allGroupMembers)}
                  className="px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300/80 cursor-pointer"
                >
                  Merge & Close Older Duplicates ({allGroupMembers.length - 1})
                </button>
              )}
            </div>
          </div>

          <div className="space-y-2">{membersInCol.map((member) => renderCard(member, column))}</div>
        </div>
      );
    }

    return elements;
  };

  const columnConfigs: Array<{
    status: KanbanStatus;
    title: string;
    subtitle: string;
    badgeTone: string;
    headerAccent: string;
    icon: React.ReactNode;
  }> = [
    {
      status: 'Open',
      title: 'Open',
      subtitle: 'Needs triage or owner assignment',
      badgeTone: 'bg-amber-100 text-amber-900 border-amber-200',
      headerAccent: 'border-t-4 border-t-amber-500',
      icon: <Inbox className="w-4 h-4 text-amber-600" />,
    },
    {
      status: 'In Progress',
      title: 'In Progress',
      subtitle: 'Assigned & active claim follow-ups',
      badgeTone: 'bg-blue-100 text-blue-900 border-blue-200',
      headerAccent: 'border-t-4 border-t-blue-600',
      icon: <PlayCircle className="w-4 h-4 text-blue-600" />,
    },
    {
      status: 'Resolved',
      title: 'Resolved',
      subtitle: 'Handled in email or marked complete',
      badgeTone: 'bg-emerald-100 text-emerald-900 border-emerald-200',
      headerAccent: 'border-t-4 border-t-emerald-600',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
    },
  ];

  return (
    <section aria-label="Kanban Operations Board" className="space-y-4">
      {/* Smart Auto-Resolve Banner */}
      {counts.ready > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-emerald-50/90 border border-emerald-200 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-600 text-white">
              <Zap className="w-4 h-4" />
            </span>
            <div>
              <div className="text-sm font-bold text-emerald-950">
                ⚡ Ready to Close ({counts.ready})
              </div>
              <p className="text-xs text-emerald-800">
                Aries detected {counts.ready} open card{counts.ready === 1 ? '' : 's'} where our team already replied or the thread looks done.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQuickFilter(quickFilter === 'ready' ? 'all' : 'ready')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-emerald-100/60 text-emerald-900 border border-emerald-300 transition-colors cursor-pointer"
            >
              {quickFilter === 'ready' ? 'Show All Cards' : `Filter Ready (${counts.ready})`}
            </button>
            <button
              type="button"
              onClick={() => onAutoCloseHandled()}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-700 hover:bg-emerald-800 text-white shadow-2xs transition-colors cursor-pointer"
            >
              Close All Handled ({counts.ready})
            </button>
          </div>
        </div>
      )}

      {/* Enhancement 4: Financial & Carrier Exposure Roll-Up Strip */}
      {showFinancialRollup && (
        <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-100 text-emerald-800">
                <DollarSign className="w-3.5 h-3.5" />
              </span>
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Financial & Carrier Exposure Roll-Up
                </h3>
                <p className="text-[11px] text-slate-500">
                  Click any carrier below to isolate their open claims, invoices, and supplements.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div>
                <span className="text-slate-500">Open Receivables: </span>
                <strong className="font-mono font-bold text-slate-900 tabular-nums">
                  ${financialRollup.totalOpenExposure.toLocaleString()}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Urgent Exposure: </span>
                <strong className="font-mono font-bold text-red-600 tabular-nums">
                  ${financialRollup.urgentExposure.toLocaleString()}
                </strong>
              </div>
              <div>
                <span className="text-slate-500">Ready to Close: </span>
                <strong className="font-mono font-bold text-emerald-700 tabular-nums">
                  ${financialRollup.readyToCloseValue.toLocaleString()}
                </strong>
              </div>
              <button
                type="button"
                onClick={() => setShowFinancialRollup(false)}
                className="text-slate-400 hover:text-slate-700 text-xs font-semibold cursor-pointer"
              >
                Hide
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {financialRollup.carriers.map((c) => {
              const active = carrierFilter === c.carrier;
              return (
                <button
                  key={c.carrier}
                  type="button"
                  onClick={() => setCarrierFilter(active ? '' : c.carrier)}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer ${
                    active
                      ? 'bg-blue-50/90 border-blue-500 ring-1 ring-blue-500'
                      : 'bg-slate-50/70 hover:bg-slate-100/80 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-bold text-slate-800 truncate">{c.carrier}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white text-slate-700 border border-slate-200 tabular-nums">
                      {c.count} {c.count === 1 ? 'card' : 'cards'}
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-sm font-mono font-extrabold text-slate-900 tabular-nums">
                      ${c.amount.toLocaleString()}
                    </span>
                    {c.urgentCount > 0 && (
                      <span className="text-[10px] font-bold text-red-600">
                        {c.urgentCount} urgent
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Enhancement 2: Team Workload & SLA Aging Heatmap Bar (Click to filter, Drag & Drop card to assign) */}
      <div className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Team workload heatmap">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            Workload (Drop card to assign):
          </span>
          {teamWorkload.map((member) => {
            const isSelected = ownerFilter === member.key;
            const isDragTarget = dragOverOwner === member.key;
            return (
              <button
                key={member.key}
                type="button"
                onClick={() => setOwnerFilter(isSelected ? '' : member.key)}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (dragOverOwner !== member.key) setDragOverOwner(member.key);
                }}
                onDragLeave={() => {
                  if (dragOverOwner === member.key) setDragOverOwner(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDropOnOwnerPill(member.key);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  isDragTarget
                    ? 'bg-blue-100 border-blue-500 ring-2 ring-blue-400 scale-105'
                    : isSelected
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                <span>{member.name}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-200/80 text-slate-800'
                  }`}
                >
                  {member.count}
                </span>
                {member.urgentCount > 0 && (
                  <span
                    title={`${member.urgentCount} urgent`}
                    className="px-1 py-0.2 rounded text-[10px] font-bold bg-red-600 text-white tabular-nums"
                  >
                    {member.urgentCount}!
                  </span>
                )}
                {member.slaBreachCount > 0 && (
                  <span
                    title={`${member.slaBreachCount} SLA > 7d`}
                    className="w-2 h-2 rounded-full bg-amber-500"
                  />
                )}
              </button>
            );
          })}
        </div>

        {!showFinancialRollup && (
          <button
            type="button"
            onClick={() => setShowFinancialRollup(true)}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
          >
            + Show Financial Roll-Up
          </button>
        )}
      </div>

      {/* Filter & Triage Bar */}
      <div className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Quick Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Quick filters">
            {[
              { id: 'all', label: `All (${counts.total})` },
              { id: 'mine', label: `My Cards (${counts.mine})` },
              { id: 'ready', label: `⚡ Ready to Close (${counts.ready})` },
              { id: 'urgent', label: `Urgent (${counts.urgent})` },
              { id: 'unassigned', label: `Unassigned (${counts.unassigned})` },
              { id: 'stale', label: `Stale > 7d (${counts.stale})` },
            ].map((pill) => {
              const active = quickFilter === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setQuickFilter(pill.id as any)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          {/* Right Controls: ⌘K Jump, Keyboard Shortcuts, Recovery Drawer, Group Claims, Refresh */}
          <div className="flex flex-wrap items-center gap-1.5">
            {onOpenCommandPalette && (
              <button
                type="button"
                onClick={onOpenCommandPalette}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 cursor-pointer"
              >
                <Command className="w-3.5 h-3.5" />
                <span>Jump</span>
                <kbd className="px-1 py-0.2 rounded bg-white border border-slate-300 text-[10px] font-mono">
                  ⌘K
                </kbd>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowKeyboardHelp((prev) => !prev)}
              title="Keyboard shortcuts (?)"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border cursor-pointer ${
                showKeyboardHelp
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Keyboard className="w-3.5 h-3.5" />
              Shortcuts
            </button>

            <button
              type="button"
              onClick={() => setShowRecoveryDrawer((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                showRecoveryDrawer
                  ? 'bg-amber-50 text-amber-900 border-amber-300'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <ArchiveRestore className="w-3.5 h-3.5" />
              Snoozed / Closed ({snoozedItems.length + completedItems.length})
            </button>

            <button
              type="button"
              onClick={() => setGroupByClaim(!groupByClaim)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                groupByClaim
                  ? 'bg-blue-50 text-blue-800 border-blue-200'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              Group Claims
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Keyboard Shortcuts Cheat-Sheet Bar */}
        {showKeyboardHelp && (
          <div className="p-2.5 rounded-lg bg-slate-900 text-slate-100 text-xs flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-white">Keyboard Triage:</span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">J</kbd> /{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">K</kbd> Navigate cards
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">D</kbd> or{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">E</kbd> Mark Done
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">U</kbd> Toggle Urgent
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">S</kbd> Snooze 1d
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">M</kbd> /{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">Enter</kbd> Open Inspector
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono">⌘K</kbd> Command Palette
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowKeyboardHelp(false)}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Search, Owner Filter, Sort Dropdown & Bulk Selection Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
            <div className="relative flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search client, claim #, street, or title..."
                className="w-full pl-8 pr-3 py-1 rounded-md text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <select
              aria-label="Filter by owner"
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              className="px-2.5 py-1 rounded-md text-xs font-medium bg-slate-50 border border-slate-200 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">All Owners</option>
              <option value="__unassigned__">Unassigned</option>
              {team.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.name}
                </option>
              ))}
              <option value="aries">Aries</option>
            </select>

            <div className="inline-flex items-center gap-1.5">
              <label htmlFor="kanban-sort-select" className="text-xs font-semibold text-slate-500">
                Sort by:
              </label>
              <select
                id="kanban-sort-select"
                aria-label="Sort cards"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as KanbanSortOption)}
                className="px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <option value="urgent">Urgent</option>
                <option value="created">Date Created</option>
                <option value="assignee">Assignee</option>
              </select>
            </div>

            {(quickFilter !== 'all' || searchQuery || ownerFilter || carrierFilter || sortBy !== 'urgent') && (
              <button
                type="button"
                onClick={() => {
                  setQuickFilter('all');
                  setSearchQuery('');
                  setOwnerFilter('');
                  setCarrierFilter('');
                  setSortBy('urgent');
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <X className="w-3 h-3" />
                Reset filters
              </button>
            )}
          </div>

          {/* Bulk Action Controls */}
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <span className="text-xs font-semibold text-slate-600 tabular-nums">
                  {selectedIds.size} selected
                </span>
                <button
                  type="button"
                  onClick={async () => {
                    const ids = Array.from(selectedIds);
                    setSelectedIds(new Set());
                    await onBulkDone(ids);
                  }}
                  className="px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs cursor-pointer"
                >
                  ✓ Done Selected ({selectedIds.size})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="px-2 py-1 rounded-md text-xs font-medium text-slate-500 hover:bg-slate-100 cursor-pointer"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Enhancement 5: Snoozed & Recently Closed Recovery Drawer */}
      {showRecoveryDrawer && (
        <div className="p-4 rounded-xl bg-white border border-amber-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Snoozed & Recently Closed Recovery Queue
              </h3>
              <p className="text-xs text-slate-500">
                Wake snoozed cards early or bring recently checked-off cards back to the active board.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowRecoveryDrawer(false)}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              Close ✕
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Snoozed List */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <div className="text-xs font-bold text-amber-800 flex items-center justify-between">
                <span>Snoozed / Returning Soon ({snoozedItems.length})</span>
              </div>
              {snoozedItems.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">No cards are currently snoozed.</p>
              ) : (
                snoozedItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded bg-white border border-slate-200 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-800 truncate">
                        #{item.id} · {cardTitle(item)}
                      </div>
                      <div className="text-[11px] text-amber-700 font-medium">
                        Returns on {item.due || 'scheduled date'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onCardReopen(item)}
                      className="px-2.5 py-1 rounded text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-900 shrink-0 cursor-pointer"
                    >
                      Wake Now
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Recently Closed List */}
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
              <div className="text-xs font-bold text-emerald-800 flex items-center justify-between">
                <span>Recently Completed ({completedItems.length})</span>
              </div>
              {completedItems.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">No cards marked done in this session yet.</p>
              ) : (
                completedItems.slice(0, 8).map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded bg-white border border-slate-200 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-600 line-through truncate">
                        #{item.id} · {cardTitle(item)}
                      </div>
                      {renderSyncReceiptBadge(item)}
                    </div>
                    <button
                      type="button"
                      onClick={() => onCardReopen(item)}
                      className="px-2.5 py-1 rounded text-xs font-semibold bg-slate-200 hover:bg-slate-300 text-slate-800 shrink-0 cursor-pointer"
                    >
                      ↺ Reopen
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Primary 3-Column Kanban Layout: Open | In Progress | Resolved */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {columnConfigs.map((col) => {
          const colItems = columnsData[col.status];
          const isDropTarget = dragOverColumn === col.status;

          return (
            <div
              key={col.status}
              data-column={col.status}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverColumn !== col.status) setDragOverColumn(col.status);
              }}
              onDragLeave={() => {
                if (dragOverColumn === col.status) setDragOverColumn(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                handleDropOnColumn(col.status);
              }}
              className={`rounded-xl bg-slate-100/80 border border-slate-200/90 flex flex-col min-h-[520px] transition-colors ${
                col.headerAccent
              } ${isDropTarget ? 'ring-2 ring-blue-500 bg-blue-50/40' : ''}`}
            >
              {/* Column Header */}
              <header className="p-3.5 bg-white/90 border-b border-slate-200/80 rounded-t-lg flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {col.icon}
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-900">{col.title}</h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold border tabular-nums ${col.badgeTone}`}
                      >
                        {colItems.length}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">{col.subtitle}</p>
                  </div>
                </div>

                {col.status === 'Resolved' && counts.ready > 0 && (
                  <button
                    type="button"
                    onClick={() => onAutoCloseHandled()}
                    className="px-2 py-1 rounded text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs cursor-pointer"
                  >
                    Confirm All ({counts.ready})
                  </button>
                )}
              </header>

              {/* Column Cards List */}
              <div className="p-2.5 space-y-2.5 flex-1">
                {renderColumnContent(col.status, colItems)}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default BoardView;
