// services/llm/metrics/experimental-circuit-breaker.ts

type CircuitState = 'closed' | 'open' | 'half-open';

type Record = {
  ok: boolean;
  ts: number;
};

const WINDOW_SIZE = 20;
const FAILURE_THRESHOLD = 0.2; // 成功率 < 20%
const OPEN_DURATION_MS = 5 * 60 * 1000; // 5 分钟

type Circuit = {
  state: CircuitState;
  openedAt?: number;
  records: Record[];
};

const circuits: Record<string, Circuit> = {};

function getCircuit(model: string): Circuit {
  if (!circuits[model]) {
    circuits[model] = {
      state: 'closed',
      records: [],
    };
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
