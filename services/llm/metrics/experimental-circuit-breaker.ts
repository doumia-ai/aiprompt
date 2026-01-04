// services/llm/metrics/experimental-circuit-breaker.ts

type CircuitState = 'closed' | 'open' | 'half-open';

type OutcomeRecord = {
  ok: boolean;
  ts: number;
};

const WINDOW_SIZE = 20;
const FAILURE_THRESHOLD = 0.2; // 成功率 < 20%
const OPEN_DURATION_MS = 5 * 60 * 1000; // 5 分钟
const MAX_CIRCUITS = 100; // 最大熔断器数量，防止内存泄漏
const CIRCUIT_CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 分钟清理一次

type Circuit = {
  state: CircuitState;
  openedAt?: number;
  records: OutcomeRecord[];
  lastAccessedAt: number; // 最后访问时间
};

const circuits: Record<string, Circuit> = {};
let lastCleanupTime = Date.now();

/**
 * 清理长时间未使用的熔断器
 */
function cleanupStaleCircuits() {
  const now = Date.now();

  // 检查是否需要清理
  if (now - lastCleanupTime < CIRCUIT_CLEANUP_INTERVAL_MS) {
    return;
  }

  lastCleanupTime = now;
  const circuitKeys = Object.keys(circuits);

  // 如果熔断器数量未超过限制，不清理
  if (circuitKeys.length <= MAX_CIRCUITS) {
    return;
  }

  // 按最后访问时间排序，删除最旧的
  const sortedKeys = circuitKeys.sort(
    (a, b) => circuits[a].lastAccessedAt - circuits[b].lastAccessedAt
  );

  // 删除超出限制的熔断器
  const keysToDelete = sortedKeys.slice(0, circuitKeys.length - MAX_CIRCUITS);
  for (const key of keysToDelete) {
    delete circuits[key];
  }
}

function getCircuit(model: string): Circuit {
  // 定期清理
  cleanupStaleCircuits();

  if (!circuits[model]) {
    circuits[model] = {
      state: 'closed',
      records: [],
      lastAccessedAt: Date.now(),
    };
  } else {
    // 更新最后访问时间
    circuits[model].lastAccessedAt = Date.now();
  }
  return circuits[model];
}

export function canCallExperimentalModel(model: string): boolean {
  const c = getCircuit(model);

  if (c.state === 'open') {
    if (
      c.openedAt &&
      Date.now() - c.openedAt > OPEN_DURATION_MS
    ) {
      // 进入 half-open
      c.state = 'half-open';
      return true;
    }
    return false;
  }

  return true; // closed / half-open
}

export function recordExperimentalOutcome(
  model: string,
  ok: boolean
) {
  const c = getCircuit(model);

  // half-open 状态下，只看一次结果
  if (c.state === 'half-open') {
    if (ok) {
      // 恢复
      c.state = 'closed';
      c.records = [];
    } else {
      // 再次熔断
      c.state = 'open';
      c.openedAt = Date.now();
    }
    return;
  }

  // closed 状态，正常统计
  c.records.push({ ok, ts: Date.now() });

  if (c.records.length > WINDOW_SIZE) {
    c.records.shift();
  }

  const successCount = c.records.filter(r => r.ok).length;
  const successRate =
    c.records.length > 0
      ? successCount / c.records.length
      : 1;

  if (
    c.records.length === WINDOW_SIZE &&
    successRate < FAILURE_THRESHOLD
  ) {
    c.state = 'open';
    c.openedAt = Date.now();
  }
}

export function getCircuitState(model: string) {
  const c = getCircuit(model);
  return {
    state: c.state,
    openedAt: c.openedAt,
    recentTotal: c.records.length,
    recentSuccess:
      c.records.filter(r => r.ok).length,
  };
}
