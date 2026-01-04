// services/llm/volces-adapter.ts

import OpenAI from 'openai';
import {
  canCallExperimentalModel,
  recordExperimentalOutcome,
} from './metrics/experimental-circuit-breaker';

// 从环境变量读取实验模型列表，支持逗号分隔
// 格式: VOLCES_EXPERIMENTAL_MODELS=ep-m-xxx,ep-m-yyy
const VOLCES_EXPERIMENTAL_MODELS = (
  process.env.VOLCES_EXPERIMENTAL_MODELS ||
  // 默认值（向后兼容）
  'ep-m-20260104054639-v6dm6,ep-m-20260104055910-gtzqr'
).split(',').map(m => m.trim()).filter(Boolean);

function assertVolcesExperimental(model: string) {
  if (!VOLCES_EXPERIMENTAL_MODELS.includes(model)) {
    throw new Error(
      `Volces model ${model} is not marked as experimental-chat`
    );
  }
}

export async function callVolcesExperimentalChat({
  model,
  messages,
  stream,
  apiKey,
}: {
  model: string;
  messages: any[];
  stream?: boolean;
  apiKey: string;
}) {
  // ① 模型合法性校验
  assertVolcesExperimental(model);

  // ② 熔断判断（正确位置）
  if (!canCallExperimentalModel(model)) {
    throw new Error(
      `Volces experimental model ${model} is temporarily circuit-open`
    );
  }

  const client = new OpenAI({
    apiKey,
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    timeout: 120_000,
    maxRetries: 0,
  });

  // ===== Streaming =====
  if (stream) {
    const streamResp = await client.chat.completions.create({
      model,
      messages,
      stream: true,
    });

    const encoder = new TextEncoder();

    return new ReadableStream({
      async start(controller) {
        let streamCompleted = false;
        try {
          for await (const part of streamResp) {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify(part)}\n\n`
              )
            );
          }
          controller.enqueue(
            encoder.encode('data: [DONE]\n\n')
          );
          streamCompleted = true;
          // ⭐ 只有流完全完成后才记录成功
          recordExperimentalOutcome(model, true);
          controller.close();
        } catch (err) {
          // 流中途失败，记录失败
          if (!streamCompleted) {
            recordExperimentalOutcome(model, false);
          }
          controller.error(err);
        }
      },
    });
  }

  // ===== Non-streaming =====
  try {
    const result = await client.chat.completions.create({
      model,
      messages,
    });

    // ⭐ 成功返回前（你问的就是这里）
    recordExperimentalOutcome(model, true);

    return result;
  } catch (err) {
    recordExperimentalOutcome(model, false);
    throw err;
  }
}
