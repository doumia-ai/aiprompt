import OpenAI from 'openai';
import type { ProviderConfig } from './providers';

export function createOpenAIClient(
  provider: ProviderConfig,
  overrideApiKey?: string
) {
  const isNvidia = provider.id === 'nvidia';

  return new OpenAI({
    apiKey: overrideApiKey || provider.apiKey || 'dummy',
    baseURL: provider.baseURL,

    // ⭐ 核心差异在这里
    timeout: isNvidia ? 15_000 : 180_000, // NVIDIA 15s 快速失败
    maxRetries: 0,
  });
}
