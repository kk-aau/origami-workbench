import { validateDoc, type Doc } from '../core/types';

export type RecoverySource = 'server' | 'browser';
export interface RecoverySnapshot {
  doc: Doc;
  projectId?: string;
  /** Revision originally edited; never adopt a newer disk revision on restore. */
  baseRevision?: string;
  /** Normalized ISO timestamp; absent when the stored date cannot be trusted. */
  updated?: string;
  source: RecoverySource;
}
export interface RecoveryChoice {
  recovery: RecoverySnapshot | null;
  /** Other valid, nonidentical drafts. Never silently discard an uncertain older draft. */
  alternatives: RecoverySnapshot[];
  warnings: string[];
}

export interface RecoveryWriteResult {
  browserSaved: boolean;
  diskSaved: boolean;
  warning: string | null;
}

/**
 * Browser storage is an additional recovery copy, not a capacity limit for
 * desktop projects. Wait for the durable write before deciding whether the
 * user needs to act. Neither a rejected browser write nor a rejected disk
 * write may prevent the other copy from being attempted.
 */
export async function saveRecoveryCopies(writers: {
  browser: () => void;
  disk?: () => Promise<unknown>;
}): Promise<RecoveryWriteResult> {
  let browserSaved = false, diskSaved = false;
  try { writers.browser(); browserSaved = true; } catch { /* Keep the previous browser draft. */ }
  if (writers.disk) {
    try { await writers.disk(); diskSaved = true; } catch { /* Report the actual surviving copy below. */ }
  }
  return {
    browserSaved, diskSaved,
    warning: diskSaved ? null : browserSaved
      ? '自动恢复副本仅写入临时缓存，未写入工程目录；请及时保存或导出工程。'
      : '自动恢复副本未能保存，请及时手动保存或导出工程。',
  };
}

const SOURCE_NAMES: Record<RecoverySource, string> = { server: '本机磁盘', browser: '浏览器' };
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

/**
 * Pick the newest trustworthy, valid local recovery draft.
 *
 * Both arguments accept a parsed envelope {doc, projectId?, updated?}; the
 * browser argument may also be the raw localStorage string. No reads, writes,
 * clock changes, or caller-owned mutations occur. App should offer alternatives
 * when content differs and ask before replacing any active edited document.
 */
export function chooseRecovery(serverValue: unknown, browserValue: unknown, now = Date.now()): RecoveryChoice {
  const warnings: string[] = [];
  const clock = Number.isFinite(now) ? now : Date.now();
  const candidates: Array<{ snapshot: RecoverySnapshot; timestamp: number | null; signature: string }> = [];
  for (const [source, raw] of [['server', serverValue], ['browser', browserValue]] as const) {
    const label = SOURCE_NAMES[source];
    if (raw === null || raw === undefined || raw === '') continue;
    let value: unknown = raw;
    if (typeof raw === 'string') {
      try { value = JSON.parse(raw); }
      catch { warnings.push(`${label}恢复副本的 JSON 已损坏，未用它覆盖工程。`); continue; }
    }
    if (value === null || value === undefined) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      warnings.push(`${label}恢复副本结构无效，未用它覆盖工程。`); continue;
    }
    const envelope = value as Record<string, unknown>;
    if (envelope.doc === null) continue; // The service explicitly reports no saved draft.
    try {
      validateDoc(envelope.doc);
      const doc = structuredClone(envelope.doc);
      // Stored recovery is JSON. This also detects cyclic or BigInt metadata
      // before App's document-signature calculation can fail.
      const documentSignature = JSON.stringify(doc);
      let projectId: string | undefined;
      if (typeof envelope.projectId === 'string' && UUID.test(envelope.projectId)) {
        projectId = envelope.projectId.toLowerCase();
      } else if (envelope.projectId !== undefined && envelope.projectId !== null && envelope.projectId !== '') {
        warnings.push(`${label}副本的工程编号无效，将作为新工程恢复，避免覆盖其他工程。`);
      }
      const timestamp = trustedTimestamp(envelope.updated, clock);
      if (timestamp === null) warnings.push(`${label}副本的保存时间缺失或异常；稿件已保留，请核对内容，不仅按时间判断。`);
      const snapshot: RecoverySnapshot = {
        doc, source, ...(projectId ? { projectId } : {}),
        ...(typeof envelope.baseRevision==='string'&&/^[a-f0-9]{64}$/.test(envelope.baseRevision)?{baseRevision:envelope.baseRevision}:{}),
        ...(timestamp !== null ? { updated: new Date(timestamp).toISOString() } : {}),
      };
      candidates.push({ snapshot, timestamp, signature: `${projectId ?? ''}\n${documentSignature}` });
    } catch {
      warnings.push(`${label}恢复副本包含无效工程数据，未用它覆盖工程；原副本未被修改。`);
    }
  }
  candidates.sort((a, b) => {
    // A wildly future/invalid date must not win forever; retain it as a choice.
    if (a.timestamp === null && b.timestamp !== null) return 1;
    if (a.timestamp !== null && b.timestamp === null) return -1;
    const delta = (b.timestamp ?? 0) - (a.timestamp ?? 0);
    if (delta !== 0) return delta;
    // Equal or unknown times cannot establish recency. Prefer browser on a tie
    // (it can contain a write that never reached the service) and disclose it.
    return a.snapshot.source === 'browser' ? -1 : b.snapshot.source === 'browser' ? 1 : 0;
  });
  const best = candidates[0];
  if (!best) return { recovery: null, alternatives: [], warnings };
  const others = candidates.slice(1).filter(item => item.signature !== best.signature);
  if (others.length) {
    if (others.some(item => item.timestamp === null || best.timestamp === null || item.timestamp === best.timestamp)) {
      warnings.push('找到内容不同的恢复副本，时间不能完全确定先后；请比较后选择，另一份仍然保留。');
    } else {
      warnings.push(`找到内容不同的恢复副本，默认提供时间较新的${SOURCE_NAMES[best.snapshot.source]}稿；另一份仍然保留。`);
    }
  }
  return { recovery: best.snapshot, alternatives: others.map(item => item.snapshot), warnings };
}

function trustedTimestamp(value: unknown, now: number): number | null {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  // Date.parse normalizes 2026-02-30 to March; reject impossible calendar dates.
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (year < 1970 || month < 1 || month > 12 || day < 1 || day > days) return null;
  if (Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > now + MAX_FUTURE_SKEW_MS) return null;
  return timestamp;
}
