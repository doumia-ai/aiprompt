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
    const upperId = id.toUpperCase();
    const baseURL = process.env[`${upperId}_BASE_URL`];
    if (!baseURL) continue;

    providers[id.toLowerCase()] = {
      id: id.toLowerCase(),
      baseURL: baseURL.replace(/\/+$/, ''), // 只 normalize，不裁剪
      apiKey: process.env[`${upperId}_API_KEY`] || '',
      defaultModel: process.env[`${upperId}_DEFAULT_MODEL`],
    };
  }

  return providers;
}
