import type { Contract } from '@/lib/api';

export type ComparisonMetricKey =
  | 'contract_id'
  | 'network'
  | 'category'
  | 'publisher'
  | 'verification_status';

export type CellTone = 'neutral' | 'best' | 'worst' | 'different';

export type DiffLine =
  | { type: 'context'; value: string }
  | { type: 'add'; value: string }
  | { type: 'remove'; value: string };

export interface ComparableContract {
  id: string;
  name: string;
  contractId: string;
  network: string;
  category: string;
  publisherId: string;
  latestVersion: string;
  versionCount: number;
  abiMethods: string[];
  isVerified: boolean;
  tags: string[];
  sourceCode: string;
  base?: Pick<Contract, 'contract_id' | 'network' | 'publisher_id' | 'wasm_hash' | 'updated_at'>;
}

function indentBlock(text: string, spaces: number) {
  const pad = ' '.repeat(spaces);
  return text
    .split('\n')
    .map((l) => (l.length > 0 ? `${pad}${l}` : l))
    .join('\n');
}

function latestVersionFromVersions(versions: Array<{ version: string; created_at: string }>) {
  if (versions.length === 0) return null;
  return [...versions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null;
}

function collectStringValues(input: unknown, sink: string[]) {
  if (typeof input === 'string') {
    sink.push(input);
    return;
  }
  if (Array.isArray(input)) {
    for (const item of input) collectStringValues(item, sink);
    return;
  }
  if (input && typeof input === 'object') {
    for (const value of Object.values(input)) collectStringValues(value, sink);
  }
}

export function extractAbiMethods(abi: unknown): string[] {
  const methods = new Set<string>();

  const visit = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (!node || typeof node !== 'object') return;

    const record = node as Record<string, unknown>;
    const directCandidates = [
      record.name,
      record.method,
      record.function,
      record.fn,
      record.symbol,
      record.export,
    ];

    for (const candidate of directCandidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        methods.add(candidate.trim());
      }
    }

    for (const [key, value] of Object.entries(record)) {
      if (['functions', 'methods', 'entries'].includes(key) && Array.isArray(value)) {
        for (const item of value) visit(item);
        continue;
      }

      if (['name_scval', 'nameScVal', 'identifier'].includes(key)) {
        const values: string[] = [];
        collectStringValues(value, values);
        for (const v of values) {
          if (v.trim()) methods.add(v.trim());
        }
      }
    }
  };

  visit(abi);
  return [...methods].sort((a, b) => a.localeCompare(b));
}

function buildFallbackSourceCode(name: string, isVerified: boolean, abiMethods: string[], latestVersion: string) {
  const versionLine = latestVersion ? `const VERSION: &str = "${latestVersion}";\n` : '';
  const verifiedLine = isVerified ? 'const VERIFIED: bool = true;\n' : 'const VERIFIED: bool = false;\n';
  const functions = abiMethods
    .slice(0, 12)
    .map((m) => `pub fn ${m}(env: Env) -> i128 {\n    env.ledger().sequence() as i128\n}\n`)
    .join('\n');

  return `// ${name}\n// Generated comparison fallback source\n\nuse soroban_sdk::{contract, contractimpl, Env};\n\n${versionLine}${verifiedLine}\n#[contract]\npub struct Contract;\n\n#[contractimpl]\nimpl Contract {\n${indentBlock(functions.trimEnd() || '  // No ABI methods available', 2)}\n}\n`;
}

export function toComparableContract(
  contract: Contract,
  options?: {
    versions?: Array<{ version: string; created_at: string }>;
    abi?: unknown;
    sourceCode?: string;
  },
): ComparableContract {
  const isVerified = Boolean(contract.is_verified);
  const versions = options?.versions ?? [];
  const latestVersion = latestVersionFromVersions(versions)?.version ?? 'Unversioned';
  const abiMethods = extractAbiMethods(options?.abi);
  const sourceCode =
    options?.sourceCode && options.sourceCode.trim().length > 0
      ? options.sourceCode
      : buildFallbackSourceCode(contract.name, isVerified, abiMethods, latestVersion);

  return {
    id: contract.id,
    name: contract.name,
    contractId: contract.contract_id,
    network: contract.network,
    category: contract.category || 'Uncategorized',
    publisherId: contract.publisher_id,
    latestVersion,
    versionCount: versions.length,
    abiMethods,
    isVerified,
    tags: contract.tags,
    sourceCode,
    base: {
      contract_id: contract.contract_id,
      network: contract.network,
      publisher_id: contract.publisher_id,
      wasm_hash: contract.wasm_hash,
      updated_at: contract.updated_at,
    },
  };
}

export function toneForMetricCell(
  metric: ComparisonMetricKey,
  value: string | number | boolean,
  allValues: Array<string | number | boolean>,
): CellTone {
  const isAllEqual =
    allValues.length > 0 && allValues.every((v) => v === allValues[0]);
  if (isAllEqual) return 'neutral';

  if (metric === 'verification_status') {
    const v = Boolean(value);
    return v ? 'best' : 'worst';
  }

  if (metric === 'contract_id' || metric === 'network' || metric === 'category' || metric === 'publisher') {
    return 'different';
  }

  return 'different';
}

export function getMetricValue(contract: ComparableContract, metric: ComparisonMetricKey): string | number | boolean {
  switch (metric) {
    case 'contract_id':
      return contract.contractId;
    case 'network':
      return contract.network;
    case 'category':
      return contract.category;
    case 'publisher':
      return contract.publisherId;
    case 'verification_status':
      return contract.isVerified;
  }
}

export function diffMethodSets(base: string[], other: string[]) {
  const baseSet = new Set(base);
  const otherSet = new Set(other);
  const added = [...otherSet].filter((m) => !baseSet.has(m)).sort((a, b) => a.localeCompare(b));
  const removed = [...baseSet].filter((m) => !otherSet.has(m)).sort((a, b) => a.localeCompare(b));
  return { added, removed };
}

export function diffLines(aText: string, bText: string): DiffLine[] {
  const a = normalizeNewlines(aText).split('\n');
  const b = normalizeNewlines(bText).split('\n');
  const result = myersDiff(a, b);
  return result;
}

function normalizeNewlines(s: string) {
  return s.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function myersDiff(a: string[], b: string[]): DiffLine[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const v = new Map<number, number>();
  v.set(1, 0);
  const trace: Array<Map<number, number>> = [];

  for (let d = 0; d <= max; d += 1) {
    const snapshot = new Map<number, number>();
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d;
      const up = k === d;
      const kPrev = down ? k + 1 : up ? k - 1 : (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0) ? k + 1 : k - 1;
      const xStart = v.get(kPrev) ?? 0;
      const x = down || (!up && (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0)) ? xStart : xStart + 1;
      let y = x - k;
      let xWalk = x;
      while (xWalk < n && y < m && a[xWalk] === b[y]) {
        xWalk += 1;
        y += 1;
      }
      snapshot.set(k, xWalk);
      if (xWalk >= n && y >= m) {
        trace.push(snapshot);
        return backtrackDiff(a, b, trace);
      }
    }
    trace.push(snapshot);
    v.clear();
    for (const [k, xVal] of snapshot.entries()) v.set(k, xVal);
  }

  return backtrackDiff(a, b, trace);
}

function backtrackDiff(a: string[], b: string[], trace: Array<Map<number, number>>): DiffLine[] {
  let x = a.length;
  let y = b.length;
  const edits: DiffLine[] = [];

  for (let d = trace.length - 1; d >= 0; d -= 1) {
    const v = trace[d];
    const k = x - y;

    const down = k === -d;
    const up = k === d;

    const kPrev = down ? k + 1 : up ? k - 1 : (v.get(k - 1) ?? 0) < (v.get(k + 1) ?? 0) ? k + 1 : k - 1;
    const xPrev = v.get(kPrev) ?? 0;
    const yPrev = xPrev - kPrev;

    while (x > xPrev && y > yPrev) {
      edits.push({ type: 'context', value: a[x - 1] ?? '' });
      x -= 1;
      y -= 1;
    }

    if (d === 0) break;

    if (x === xPrev) {
      edits.push({ type: 'add', value: b[y - 1] ?? '' });
      y -= 1;
    } else {
      edits.push({ type: 'remove', value: a[x - 1] ?? '' });
      x -= 1;
    }
  }

  edits.reverse();
  return coalesceContext(edits);
}

function coalesceContext(lines: DiffLine[]) {
  const out: DiffLine[] = [];
  for (const line of lines) {
    if (out.length === 0) {
      out.push(line);
      continue;
    }
    const prev = out[out.length - 1];
    if (prev.type === 'context' && line.type === 'context') {
      out.push(line);
      continue;
    }
    out.push(line);
  }
  return out;
}

