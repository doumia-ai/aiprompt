import OpenAI from 'openai';
import { loadProviders } from './providers';

const WARMUP_PROMPT = 'ping';

export async function warmupNvidia() {
  const providers = loadProviders();
  const nvidia = providers['nvidia'];

  if (!nvidia) {
    console.log('[NVIDIA WARMUP] No NVIDIA provider configured');
    return;
  }

  console.log('[NVIDIA WARMUP] Starting warmup...');

  const client = new OpenAI({
    apiKey: nvidia.apiKey,
    baseURL: nvidia.baseURL,
    timeout: 120_000, // ⭐ 允许它慢慢来
    maxRetries: 0,
  });

  try {
    await client.chat.completions.create({
      model: nvidia.defaultModel,
      messages: [
        { role: 'user', content: WARMUP_PROMPT },
      ],
      stream: false,
    });

    console.log('[NVIDIA WARMUP] Warmup success');
  } catch (err) {
    console.warn('[NVIDIA WARMUP] Warmup failed (ignored)', err);
  }
}
