/**
 * Models API Route
 *
 * Returns available providers and models based on environment configuration
 *
 * Environment variables format:
 * - PROVIDERS: Comma-separated list of provider IDs (e.g., "openai,anthropic,deepseek")
 * - DEFAULT_PROVIDER: Default provider ID
 * - DEFAULT_MODEL: Default model ID (global fallback)
 *
 * For each provider, configure:
 * - {PROVIDER}_NAME: Display name (e.g., OPENAI_NAME="OpenAI")
 * - {PROVIDER}_BASE_URL: API base URL (e.g., OPENAI_BASE_URL="https://api.openai.com/v1")
 * - {PROVIDER}_API_KEY: API key (e.g., OPENAI_API_KEY="sk-xxx")
 * - {PROVIDER}_MODELS: Comma-separated model list with format "id:label" (e.g., OPENAI_MODELS="gpt-4o:GPT-4o,gpt-4o-mini:GPT-4o Mini")
 * - {PROVIDER}_DEFAULT_MODEL: Default model for this provider (e.g., OPENAI_DEFAULT_MODEL="gpt-4o")
 */

import { NextResponse } from 'next/server';

// Provider configuration interface (local to this route, different from services/llm/providers)
// This interface is for the models API response, not for LLM client configuration
interface ModelsRouteProviderConfig {
  id: string;
  name: string;
  baseURL: string;
  apiKey: string;
  models: { id: string; label: string }[];
  defaultModel: string;
}

// Parse providers from environment variables
function getProviders(): ModelsRouteProviderConfig[] {
  const providersStr = process.env.PROVIDERS || 'deepseek';
  const providerIds = providersStr.split(',').map((p: string) => p.trim()).filter(Boolean);

  const providers: ModelsRouteProviderConfig[] = [];

  for (const providerId of providerIds) {
    const upperProviderId = providerId.toUpperCase();
    
    // Get provider configuration from environment
    const name = process.env[`${upperProviderId}_NAME`] || providerId;
    const baseUrl = process.env[`${upperProviderId}_BASE_URL`] || '';
    const apiKey = process.env[`${upperProviderId}_API_KEY`] || '';
    const modelsStr = process.env[`${upperProviderId}_MODELS`] || '';
    const defaultModel = process.env[`${upperProviderId}_DEFAULT_MODEL`] || '';

    // Parse models: format is "model-id:Display Name,model-id2:Display Name 2"
    const models = modelsStr
      .split(',')
      .map((m: string) => m.trim())
      .filter(Boolean)
      .map((m: string) => {
        const [id, label] = m.split(':').map((s: string) => s.trim());
        return { id: id || m, label: label || id || m };
      });

    // Only add provider if it has at least base URL configured
    if (baseUrl) {
      providers.push({
        id: providerId,
        name,
        baseURL: baseUrl,
        apiKey,
        models,
        // Use configured default or first model in list
        defaultModel: defaultModel || models[0]?.id || '',
      });
    }
  }

  // Fallback: if no providers configured, use legacy single-provider config
  if (providers.length === 0) {
    const legacyBaseUrl = process.env.LLM_BACKEND_URL || '';
    const legacyApiKey = process.env.LLM_API_KEY || '';
    const legacyModels = process.env.FREE_MODELS || 'deepseek';
    const defaultModel = process.env.DEFAULT_MODEL || 'deepseek';

    if (legacyBaseUrl) {
      const models = legacyModels.split(',').map((m: string) => m.trim()).filter(Boolean);
      providers.push({
        id: 'default',
        name: '默认服务',
        baseURL: legacyBaseUrl,
        apiKey: legacyApiKey,
        models: models.map((id: string) => ({
          id,
          label: MODEL_LABELS[id] || id,
        })),
        defaultModel: defaultModel,
      });
    }
  }

  return providers;
}

// Legacy model display names (for backward compatibility)
const MODEL_LABELS: Record<string, string> = {
  'deepseek': 'DeepSeek',
  'mistral': 'Mistral',
  'openai': 'GPT-4o',
  'openai-fast': 'GPT-4o Mini',
  'openai-large': 'GPT-4.5',
  'claude': 'Claude Sonnet',
  'claude-fast': 'Claude Haiku',
  'claude-large': 'Claude Opus',
  'gemini': 'Gemini Pro',
  'gemini-fast': 'Gemini Flash',
  'grok': 'Grok',
  'qwen-coder': 'Qwen Coder',
};

export async function GET() {
  const providers = getProviders();
  const defaultProvider = process.env.DEFAULT_PROVIDER || providers[0]?.id || 'default';
  const globalDefaultModel = process.env.DEFAULT_MODEL || providers[0]?.defaultModel || providers[0]?.models[0]?.id || 'deepseek';

  // Build response with providers and their models
  const response = {
    providers: providers.map((p) => ({
      id: p.id,
      name: p.name,
      isConfigured: Boolean(p.apiKey),
      defaultModel: p.defaultModel, // Each provider's default model
      models: p.models.map((m) => ({
        id: m.id,
        label: m.label,
        providerId: p.id,
        isDefault: m.id === p.defaultModel, // Mark default model for this provider
      })),
    })),
    defaultProvider,
    defaultModel: globalDefaultModel,
    // Flatten all models for backward compatibility
    models: providers.flatMap((p) =>
      p.models.map((m) => ({
        id: `${p.id}:${m.id}`,
        label: `${m.label} (${p.name})`,
        providerId: p.id,
        modelId: m.id,
        isDefault: p.id === defaultProvider && m.id === p.defaultModel,
      }))
    ),
  };

  return NextResponse.json(response);
}
