import OpenAI from 'openai';
import type { ProviderConfig } from './providers';

export class MissingApiKeyError extends Error {
  constructor(providerId: string) {
    super(`Provider "${providerId}" 未配置 API Key`);
    this.name = 'MissingApiKeyError';
  }
}

export function createOpenAIClient(
  provider: ProviderConfig,
  overrideApiKey?: string
) {
  const apiKey = overrideApiKey || provider.apiKey;

  // 验证 API Key 是否存在
  if (!apiKey) {
    throw new MissingApiKeyError(provider.id);
  }

  const isNvidia = provider.id === 'nvidia';

  return new OpenAI({
    apiKey,
    baseURL: provider.baseURL,

    // ⭐ 核心差异在这里
    timeout: isNvidia ? 15_000 : 180_000, // NVIDIA 15s 快速失败
    maxRetries: 0,
  });
}
