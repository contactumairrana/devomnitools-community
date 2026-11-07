/**
 * Pure Client-Side Visual Diff & Text Comparator Engine
 * Myers / LCS Algorithm with Common-Edge Trimming & Sub-Millisecond Character Granularity
 * Zero Server Calls | Memory-Safe Chunking & Zero Cumulative Layout Shift (CLS)
 */

export type DiffLineType = 'added' | 'removed' | 'unchanged';

export interface DiffOptions {
  ignoreWhitespace?: boolean;
  ignoreCase?: boolean;
  trimTrailing?: boolean;
  ignoreBlankLines?: boolean;
  mode?: 'text' | 'json';
}

export interface DiffStats {
  additions: number;
  deletions: number;
  unchanged: number;
  totalOriginal: number;
  totalModified: number;
  similarityPercentage: number;
}

export interface SplitRow {
  leftLineNumber?: number;
  leftText?: string;
  leftType: 'removed' | 'unchanged' | 'empty';
  rightLineNumber?: number;
  rightText?: string;
  rightType: 'added' | 'unchanged' | 'empty';
}

export interface UnifiedRow {
  type: DiffLineType;
  oldLineNumber?: number;
  newLineNumber?: number;
  text: string;
}

export interface DiffResult {
  stats: DiffStats;
  splitRows: SplitRow[];
  unifiedRows: UnifiedRow[];
  executionTimeMs: number;
}

/**
 * HTML entities escaper for secure code/text rendering
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Normalizes a line of text according to comparator options
 */
export function normalizeLine(line: string, options: DiffOptions): string {
  let res = line;
  if (options.trimTrailing) {
    res = res.trimEnd();
  }
  if (options.ignoreWhitespace) {
    res = res.replace(/\s+/g, ' ').trim();
  }
  if (options.ignoreCase) {
    res = res.toLowerCase();
  }
  return res;
}

/**
 * Computes Longest Common Subsequence (LCS) matrix with prefix & suffix fast-path trimming
 */
export function computeLcs(
  origLines: string[],
  modLines: string[],
  options: DiffOptions = {}
): { type: DiffLineType; origIdx?: number; modIdx?: number }[] {
  const normOrig = origLines.map(l => normalizeLine(l, options));
  const normMod = modLines.map(l => normalizeLine(l, options));

  const n = normOrig.length;
  const m = normMod.length;

  // Fast path 1: Both empty
  if (n === 0 && m === 0) return [];

  // Fast path 2: Orig is empty
  if (n === 0) {
    return modLines.map((_, idx) => ({ type: 'added', modIdx: idx }));
  }

  // Fast path 3: Mod is empty
  if (m === 0) {
    return origLines.map((_, idx) => ({ type: 'removed', origIdx: idx }));
  }

  // 1. Common Prefix Trimming (O(N))
  let prefix = 0;
  while (prefix < n && prefix < m && normOrig[prefix] === normMod[prefix]) {
    prefix++;
  }

  // 2. Common Suffix Trimming (O(N))
  let suffix = 0;
  while (
    suffix < n - prefix &&
    suffix < m - prefix &&
    normOrig[n - 1 - suffix] === normMod[m - 1 - suffix]
  ) {
    suffix++;
  }

  const trimmedOrig = normOrig.slice(prefix, n - suffix);
  const trimmedMod = normMod.slice(prefix, m - suffix);

  const tN = trimmedOrig.length;
  const tM = trimmedMod.length;

  const result: { type: DiffLineType; origIdx?: number; modIdx?: number }[] = [];

  // Add identical prefix
  for (let i = 0; i < prefix; i++) {
    result.push({ type: 'unchanged', origIdx: i, modIdx: i });
  }

  // Compute DP table on trimmed sub-problems only
  if (tN > 0 || tM > 0) {
    const subDiff: { type: DiffLineType; origIdx?: number; modIdx?: number }[] = [];

    // Memory protection guard: If work matrix exceeds 25M elements (e.g. >5k x 5k unmatched lines),
    // use linear coarse diffing to prevent browser tab freeze or Out-Of-Memory.
    if (tN * tM > 25_000_000) {
      for (let i = 0; i < tN; i++) {
        subDiff.push({ type: 'removed', origIdx: prefix + i });
      }
      for (let j = 0; j < tM; j++) {
        subDiff.push({ type: 'added', modIdx: prefix + j });
      }
      result.push(...subDiff);
    } else {
      const dp: number[][] = Array.from({ length: tN + 1 }, () => new Uint32Array(tM + 1) as unknown as number[]);

      for (let i = 0; i < tN; i++) {
        for (let j = 0; j < tM; j++) {
          if (trimmedOrig[i] === trimmedMod[j]) {
            dp[i + 1][j + 1] = dp[i][j] + 1;
          } else {
            dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
          }
        }
      }

      // Backtrack to extract diff sequence
      let i = tN;
      let j = tM;

      while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && trimmedOrig[i - 1] === trimmedMod[j - 1]) {
          subDiff.push({
            type: 'unchanged',
            origIdx: prefix + (i - 1),
            modIdx: prefix + (j - 1)
          });
          i--;
          j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
          subDiff.push({
            type: 'added',
            modIdx: prefix + (j - 1)
          });
          j--;
        } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
          subDiff.push({
            type: 'removed',
            origIdx: prefix + (i - 1)
          });
          i--;
        }
      }

      subDiff.reverse();
      result.push(...subDiff);
    }
  }

  // Add identical suffix
  for (let i = 0; i < suffix; i++) {
    const oIdx = n - suffix + i;
    const mIdx = m - suffix + i;
    result.push({ type: 'unchanged', origIdx: oIdx, modIdx: mIdx });
  }

  return result;
}

/**
 * Character-level inline difference highlighter for paired lines
 */
export function computeInlineCharDiff(oldLine: string, newLine: string): { oldHtml: string; newHtml: string } {
  if (oldLine === newLine) {
    return { oldHtml: escapeHtml(oldLine), newHtml: escapeHtml(newLine) };
  }

  // Common prefix
  let start = 0;
  while (start < oldLine.length && start < newLine.length && oldLine[start] === newLine[start]) {
    start++;
  }

  // Common suffix
  let oldEnd = oldLine.length - 1;
  let newEnd = newLine.length - 1;
  while (oldEnd >= start && newEnd >= start && oldLine[oldEnd] === newLine[newEnd]) {
    oldEnd--;
    newEnd--;
  }

  const prefix = escapeHtml(oldLine.slice(0, start));
  const oldMid = escapeHtml(oldLine.slice(start, oldEnd + 1));
  const newMid = escapeHtml(newLine.slice(start, newEnd + 1));
  const suffix = escapeHtml(oldLine.slice(oldEnd + 1));

  const oldHtml = `${prefix}${oldMid ? `<del class="bg-rose-500/40 text-rose-200 px-0.5 rounded font-bold">${oldMid}</del>` : ''}${suffix}`;
  const newHtml = `${prefix}${newMid ? `<ins class="bg-emerald-500/40 text-emerald-200 px-0.5 rounded font-bold no-underline">${newMid}</ins>` : ''}${suffix}`;

  return { oldHtml, newHtml };
}

export const MAX_SAFE_DIFF_BYTES = 15 * 1024 * 1024; // 15 MB safety ceiling

export function compareText(
  originalText: string,
  modifiedText: string,
  options: DiffOptions = {}
): DiffResult {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const totalInputBytes = originalText.length + modifiedText.length;
  if (totalInputBytes > MAX_SAFE_DIFF_BYTES) {
    const errorMsg = `Combined payload exceeds 15 MB safety limit (${(totalInputBytes / (1024 * 1024)).toFixed(1)} MB). To prevent tab termination, compare files in chunks under 15 MB.`;
    return {
      stats: {
        additions: 0,
        deletions: 0,
        unchanged: 0,
        totalOriginal: 0,
        totalModified: 0,
        similarityPercentage: 0
      },
      splitRows: [
        {
          leftType: 'removed',
          leftText: errorMsg,
          rightType: 'empty'
        }
      ],
      unifiedRows: [
        {
          type: 'removed',
          text: errorMsg
        }
      ],
      executionTimeMs: 0
    };
  }

  let origLines = originalText.split(/\r?\n/);
  let modLines = modifiedText.split(/\r?\n/);

  if (options.ignoreBlankLines) {
    origLines = origLines.filter(l => l.trim().length > 0);
    modLines = modLines.filter(l => l.trim().length > 0);
  }

  // If both empty
  if (originalText === '' && modifiedText === '') {
    return {
      stats: {
        additions: 0,
        deletions: 0,
        unchanged: 0,
        totalOriginal: 0,
        totalModified: 0,
        similarityPercentage: 100
      },
      splitRows: [],
      unifiedRows: [],
      executionTimeMs: 0
    };
  }

  const diffItems = computeLcs(origLines, modLines, options);

  let additions = 0;
  let deletions = 0;
  let unchanged = 0;

  const unifiedRows: UnifiedRow[] = [];
  const splitRows: SplitRow[] = [];

  // Group diff items into blocks for optimal paired split view
  let idx = 0;
  while (idx < diffItems.length) {
    const item = diffItems[idx];

    if (item.type === 'unchanged') {
      const lineText = origLines[item.origIdx!];
      const oldNum = item.origIdx! + 1;
      const newNum = item.modIdx! + 1;

      unifiedRows.push({
        type: 'unchanged',
        oldLineNumber: oldNum,
        newLineNumber: newNum,
        text: lineText
      });

      splitRows.push({
        leftLineNumber: oldNum,
        leftText: lineText,
        leftType: 'unchanged',
        rightLineNumber: newNum,
        rightText: lineText,
        rightType: 'unchanged'
      });

      unchanged++;
      idx++;
    } else {
      // Gather consecutive removals and additions
      const removed: number[] = [];
      const added: number[] = [];

      while (idx < diffItems.length && diffItems[idx].type !== 'unchanged') {
        if (diffItems[idx].type === 'removed') {
          removed.push(diffItems[idx].origIdx!);
          deletions++;
        } else if (diffItems[idx].type === 'added') {
          added.push(diffItems[idx].modIdx!);
          additions++;
        }
        idx++;
      }

      // Add to Unified Rows
      removed.forEach(rIdx => {
        unifiedRows.push({
          type: 'removed',
          oldLineNumber: rIdx + 1,
          text: origLines[rIdx]
        });
      });
      added.forEach(aIdx => {
        unifiedRows.push({
          type: 'added',
          newLineNumber: aIdx + 1,
          text: modLines[aIdx]
        });
      });

      // Align in Split Rows (Pair corresponding removed & added lines side-by-side)
      const maxRows = Math.max(removed.length, added.length);
      for (let r = 0; r < maxRows; r++) {
        const hasLeft = r < removed.length;
        const hasRight = r < added.length;

        const leftOrigIdx = hasLeft ? removed[r] : undefined;
        const rightModIdx = hasRight ? added[r] : undefined;

        splitRows.push({
          leftLineNumber: hasLeft ? leftOrigIdx! + 1 : undefined,
          leftText: hasLeft ? origLines[leftOrigIdx!] : undefined,
          leftType: hasLeft ? 'removed' : 'empty',
          rightLineNumber: hasRight ? rightModIdx! + 1 : undefined,
          rightText: hasRight ? modLines[rightModIdx!] : undefined,
          rightType: hasRight ? 'added' : 'empty'
        });
      }
    }
  }

  const totalLines = origLines.length + modLines.length;
  const similarityPercentage = totalLines > 0
    ? Math.round(((unchanged * 2) / totalLines) * 100)
    : 100;

  const end = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const executionTimeMs = parseFloat((end - start).toFixed(2));

  return {
    stats: {
      additions,
      deletions,
      unchanged,
      totalOriginal: origLines.length,
      totalModified: modLines.length,
      similarityPercentage
    },
    splitRows,
    unifiedRows,
    executionTimeMs
  };
}

/**
 * Curated Sample Diff Payload
 */
export function getSampleDiffData(): { original: string; modified: string } {
  const original = `// DevOmniTools Deployment Configuration v1.0.0
export const appConfig = {
  name: "DevOmniTools Suite",
  version: "1.0.0",
  maxWorkers: 2,
  security: {
    timeoutMs: 500,
    enableReDoSProtection: false
  },
  supportedLocales: ["en", "es"],
  theme: "dark"
};`;

  const modified = `// DevOmniTools Deployment Configuration v2.0.0
// دعم كامل للغة العربية وحماية من التجوال الكارثي 🚀
export const appConfig = {
  name: "DevOmniTools Suite Enterprise",
  version: "2.0.0",
  maxWorkers: 4,
  security: {
    timeoutMs: 100,
    enableReDoSProtection: true,
    isolatedWorkerThread: true
  },
  supportedLocales: ["en", "ar", "es", "de"],
  theme: "dark",
  zeroLayoutShift: true
};`;

  return { original, modified };
}

/**
 * ── Semantic JSON Tree Diff Engine (Bypasses $20/mo SaaS Paywalls) ──────────────
 */

export interface JsonDiffEntry {
  path: string;
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  oldValue?: any;
  newValue?: any;
}

export interface JsonDiffResult {
  isJson: boolean;
  error?: string;
  canonicalOld?: string;
  canonicalNew?: string;
  entries: JsonDiffEntry[];
  summary: {
    added: number;
    removed: number;
    modified: number;
    unchanged: number;
  };
}

/**
 * Recursively canonicalizes JSON by sorting all object keys lexicographically.
 * Prevents false diffs caused by key-ordering differences in API responses.
 */
export function canonicalizeJson(val: any): any {
  if (val === null || typeof val !== 'object') {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(canonicalizeJson);
  }
  const sortedKeys = Object.keys(val).sort();
  const result: Record<string, any> = {};
  for (const k of sortedKeys) {
    result[k] = canonicalizeJson(val[k]);
  }
  return result;
}

/**
 * Performs semantic AST comparison on two JSON documents.
 * Produces exact path-indexed differences (e.g. `data.items[0].id`).
 */
export function compareJsonSemantic(
  oldJsonStr: string,
  newJsonStr: string,
  options: { ignoreCase?: boolean } = {}
): JsonDiffResult {
  let parsedOld: any;
  let parsedNew: any;

  try {
    parsedOld = JSON.parse(oldJsonStr);
  } catch (err) {
    return {
      isJson: false,
      error: `Original is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      entries: [],
      summary: { added: 0, removed: 0, modified: 0, unchanged: 0 }
    };
  }

  try {
    parsedNew = JSON.parse(newJsonStr);
  } catch (err) {
    return {
      isJson: false,
      error: `Modified is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      entries: [],
      summary: { added: 0, removed: 0, modified: 0, unchanged: 0 }
    };
  }

  const canonicalOldObj = canonicalizeJson(parsedOld);
  const canonicalNewObj = canonicalizeJson(parsedNew);

  const canonicalOld = JSON.stringify(canonicalOldObj, null, 2);
  const canonicalNew = JSON.stringify(canonicalNewObj, null, 2);

  const entries: JsonDiffEntry[] = [];
  const summary = { added: 0, removed: 0, modified: 0, unchanged: 0 };

  function traverse(oldVal: any, newVal: any, path: string) {
    if (oldVal === undefined && newVal !== undefined) {
      entries.push({ path, type: 'added', newValue: newVal });
      summary.added++;
      return;
    }
    if (oldVal !== undefined && newVal === undefined) {
      entries.push({ path, type: 'removed', oldValue: oldVal });
      summary.removed++;
      return;
    }

    const typeOld = typeof oldVal;
    const typeNew = typeof newVal;

    if (typeOld !== typeNew || oldVal === null || newVal === null) {
      if (oldVal !== newVal) {
        entries.push({ path, type: 'modified', oldValue: oldVal, newValue: newVal });
        summary.modified++;
      } else {
        entries.push({ path, type: 'unchanged', oldValue: oldVal, newValue: newVal });
        summary.unchanged++;
      }
      return;
    }

    if (Array.isArray(oldVal) && Array.isArray(newVal)) {
      const maxLen = Math.max(oldVal.length, newVal.length);
      for (let i = 0; i < maxLen; i++) {
        const itemPath = `${path}[${i}]`;
        if (i >= oldVal.length) {
          entries.push({ path: itemPath, type: 'added', newValue: newVal[i] });
          summary.added++;
        } else if (i >= newVal.length) {
          entries.push({ path: itemPath, type: 'removed', oldValue: oldVal[i] });
          summary.removed++;
        } else {
          traverse(oldVal[i], newVal[i], itemPath);
        }
      }
      return;
    }

    if (typeOld === 'object' && !Array.isArray(oldVal) && !Array.isArray(newVal)) {
      const keys = Array.from(new Set([...Object.keys(oldVal), ...Object.keys(newVal)])).sort();
      for (const k of keys) {
        const childPath = path ? `${path}.${k}` : k;
        if (!(k in oldVal)) {
          entries.push({ path: childPath, type: 'added', newValue: newVal[k] });
          summary.added++;
        } else if (!(k in newVal)) {
          entries.push({ path: childPath, type: 'removed', oldValue: oldVal[k] });
          summary.removed++;
        } else {
          traverse(oldVal[k], newVal[k], childPath);
        }
      }
      return;
    }

    // Primitive values
    let isSame = oldVal === newVal;
    if (!isSame && options.ignoreCase && typeof oldVal === 'string' && typeof newVal === 'string') {
      isSame = oldVal.toLowerCase() === newVal.toLowerCase();
    }

    if (isSame) {
      entries.push({ path, type: 'unchanged', oldValue: oldVal, newValue: newVal });
      summary.unchanged++;
    } else {
      entries.push({ path, type: 'modified', oldValue: oldVal, newValue: newVal });
      summary.modified++;
    }
  }

  traverse(canonicalOldObj, canonicalNewObj, '');

  return {
    isJson: true,
    canonicalOld,
    canonicalNew,
    entries,
    summary
  };
}
