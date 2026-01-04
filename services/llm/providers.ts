export interface ProviderConfig {
  id: string;
  baseURL: string;
  apiKey: string;
  defaultModel?: string;
}

export function loadProviders(): Record<string, ProviderConfig> {
  const providers: Record<string, ProviderConfig> = {};
  const list = process.env.PROVIDERS?.split(',').map(p => p.trim()) || [];

  for (const id of list) {
    const baseURL = process.env[`${id}_BASE_URL`];
    if (!baseURL) continue;

    providers[id.toLowerCase()] = {
      id: id.toLowerCase(),
      baseURL: baseURL.replace(/\/+$/, ''), // 只 normalize，不裁剪
      apiKey: process.env[`${id}_API_KEY`] || '',
      defaultModel: process.env[`${id}_DEFAULT_MODEL`],
    };
  }

  return providers;
}
