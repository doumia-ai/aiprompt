'use client';

/**
 * Settings Store - Unified configuration management
 * Supports multiple providers with their respective models
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { Settings, ModelOption, Provider } from '@/types';

const STORAGE_KEY = 'better-prompt-settings';
const OLD_MODEL_KEY = 'better-prompt-selected-model';

// Default models (examples - users should configure their own via custom API)
// These are placeholders to demonstrate the UI; actual model IDs depend on your LLM provider
export const DEFAULT_MODELS: ModelOption[] = [
  { id: 'gpt-4o', value: 'gpt-4o', label: 'GPT-4o', isBuiltIn: true },
  { id: 'gpt-4o-mini', value: 'gpt-4o-mini', label: 'GPT-4o Mini', isBuiltIn: true },
  { id: 'claude-3-5-sonnet', value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', isBuiltIn: true },
  { id: 'deepseek-chat', value: 'deepseek-chat', label: 'DeepSeek Chat', isBuiltIn: true },
];

const DEFAULT_SETTINGS: Settings = {
  apiBase: '',
  apiKey: '',
  models: DEFAULT_MODELS,
  selectedModelId: '',
  selectedProviderId: '',
};

// Generate unique ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Merge stored models with defaults to ensure new fields are present
const mergeModelsWithDefaults = (storedModels: ModelOption[]): ModelOption[] => {
  const result: ModelOption[] = [];
  const processedIds = new Set<string>();

  // First, process stored models and merge with defaults
  for (const stored of storedModels) {
    const defaultModel = DEFAULT_MODELS.find((d) => d.id === stored.id);
    if (defaultModel) {
      // Built-in model: merge with default to get new fields
      result.push({ ...defaultModel, ...stored, noApiRequired: defaultModel.noApiRequired });
    } else {
      // Custom model: keep as-is
      result.push(stored);
    }
    processedIds.add(stored.id);
  }

  // Then, add any missing default models
  for (const defaultModel of DEFAULT_MODELS) {
    if (!processedIds.has(defaultModel.id)) {
      result.push(defaultModel);
    }
  }

  return result;
};

// Load settings from localStorage
const loadSettings = (): Settings => {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        ...DEFAULT_SETTINGS,
        ...parsed,
        models: parsed.models ? mergeModelsWithDefaults(parsed.models) : DEFAULT_SETTINGS.models,
      };
    }
  } catch (e) {
    console.error('Failed to load settings from localStorage:', e);
  }

  // Migrate old model selection
  try {
    const oldModel = localStorage.getItem(OLD_MODEL_KEY);
    if (oldModel) {
      const matchingModel = DEFAULT_MODELS.find((m) => m.value === oldModel);
      if (matchingModel) {
        return {
          ...DEFAULT_SETTINGS,
          selectedModelId: matchingModel.id,
        };
      }
    }
  } catch (e) {
    console.error('Failed to migrate old model selection:', e);
  }

  return DEFAULT_SETTINGS;
};

// Save settings to localStorage
const saveSettings = (settings: Settings) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    localStorage.removeItem(OLD_MODEL_KEY);
  } catch (e) {
    console.error('Failed to save settings to localStorage:', e);
  }
};

// API response types
interface ApiProvider {
  id: string;
  name: string;
  isConfigured: boolean;
  defaultModel: string; // Default model for this provider
  models: Array<{
    id: string;
    label: string;
    providerId: string;
    isDefault: boolean;
  }>;
}

interface ApiModel {
  id: string;
  label: string;
  providerId: string;
  modelId: string;
  isDefault: boolean;
}

interface ModelsApiResponse {
  providers: ApiProvider[];
  defaultProvider: string;
  defaultModel: string;
  models: ApiModel[];
}

// Store provider default models mapping
interface ProviderDefaultModels {
  [providerId: string]: string;
}

// Fetch providers and models from backend API
const fetchProvidersAndModels = async (): Promise<ModelsApiResponse | null> => {
  try {
    const response = await fetch('/api/v1/models');
    if (!response.ok) return null;
    const data = await response.json();
    return data as ModelsApiResponse;
  } catch (e) {
    console.error('Failed to fetch providers and models:', e);
    return null;
  }
};

// Store interface
interface SettingsStore {
  settings: Settings;
  selectedModel: ModelOption | undefined;
  freeModels: ModelOption[];
  isLoadingFreeModels: boolean;
  // Provider support
  providers: Provider[];
  selectedProvider: Provider | undefined;

  // API config
  updateApiBase: (base: string) => void;
  updateApiKey: (key: string) => void;

  // Model management
  addModel: (model: Omit<ModelOption, 'id' | 'isBuiltIn'>) => string;
  updateModel: (id: string, updates: Partial<Pick<ModelOption, 'value' | 'label'>>) => void;
  deleteModel: (id: string) => void;
  selectModel: (id: string) => void;
  
  // Provider management
  selectProvider: (id: string) => void;
  getModelsForProvider: (providerId: string) => ModelOption[];

  // Utility
  getSelectedModelValue: () => string;
  getModelOptions: () => { value: string; label: string }[];
  getProviderOptions: () => { value: string; label: string }[];
}

export const useSettingsStore = (): SettingsStore => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [freeModels, setFreeModels] = useState<ModelOption[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [isLoadingFreeModels, setIsLoadingFreeModels] = useState(true);
  const [defaultFreeModelId, setDefaultFreeModelId] = useState<string>('');
  const [defaultProviderId, setDefaultProviderId] = useState<string>('');
  // Store default model for each provider
  const [providerDefaultModels, setProviderDefaultModels] = useState<ProviderDefaultModels>({});

  // Load settings and fetch providers/models on mount
  useEffect(() => {
    const init = async () => {
      // Load saved settings
      const savedSettings = loadSettings();

      // Fetch providers and models from backend
      setIsLoadingFreeModels(true);
      const apiData = await fetchProvidersAndModels();
      setIsLoadingFreeModels(false);

      if (apiData) {
        // Build provider default models mapping
        const defaultModelsMap: ProviderDefaultModels = {};
        apiData.providers.forEach((p) => {
          if (p.defaultModel) {
            // Store the composite ID (providerId:modelId)
            defaultModelsMap[p.id] = `${p.id}:${p.defaultModel}`;
          } else if (p.models.length > 0) {
            // Fallback to first model
            defaultModelsMap[p.id] = `${p.id}:${p.models[0].id}`;
          }
        });
        setProviderDefaultModels(defaultModelsMap);

        // Convert API providers to Provider type
        const fetchedProviders: Provider[] = apiData.providers.map((p) => ({
          id: p.id,
          name: p.name,
          baseUrl: '', // Not exposed to frontend for security
          isConfigured: p.isConfigured,
        }));
        setProviders(fetchedProviders);
        setDefaultProviderId(apiData.defaultProvider);

        // Convert API models to ModelOption type
        const fetchedModels: ModelOption[] = apiData.models.map((m) => ({
          id: m.id,
          value: m.id, // Use composite ID (providerId:modelId)
          label: m.label,
          isBuiltIn: true,
          noApiRequired: true,
          providerId: m.providerId,
        }));
        setFreeModels(fetchedModels);
        setDefaultFreeModelId(apiData.defaultModel);

        // If no provider selected, use default
        if (!savedSettings.selectedProviderId && fetchedProviders.length > 0) {
          savedSettings.selectedProviderId = apiData.defaultProvider;
        }

        // If no model selected, use default model for the selected provider
        if (!savedSettings.selectedModelId && fetchedModels.length > 0) {
          const selectedProviderId = savedSettings.selectedProviderId || apiData.defaultProvider;
          // Use provider's default model
          const providerDefaultModelId = defaultModelsMap[selectedProviderId];
          if (providerDefaultModelId) {
            savedSettings.selectedModelId = providerDefaultModelId;
          } else {
            // Fallback: find first model for this provider
            const defaultModelForProvider = fetchedModels.find(
              (m) => m.providerId === selectedProviderId
            );
            if (defaultModelForProvider) {
              savedSettings.selectedModelId = defaultModelForProvider.id;
            } else {
              savedSettings.selectedModelId = fetchedModels[0].id;
            }
          }
        }
      }

      setSettings(savedSettings);
    };

    init();
  }, []);

  // Check if custom API is configured
  const hasCustomApi = Boolean(settings.apiBase && settings.apiKey);

  // Get available models based on API configuration and selected provider
  const availableModels = useMemo(() => {
    if (hasCustomApi) {
      // With custom API: show all models (free + custom)
      return [...freeModels, ...settings.models];
    }
    // Without custom API: only show free models
    return freeModels;
  }, [settings.models, freeModels, hasCustomApi]);

  // Get models for a specific provider
  const getModelsForProvider = useCallback((providerId: string): ModelOption[] => {
    return availableModels.filter((m) => m.providerId === providerId);
  }, [availableModels]);

  // Selected provider computed
  const selectedProvider = useMemo(() => {
    return providers.find((p) => p.id === settings.selectedProviderId);
  }, [providers, settings.selectedProviderId]);

  // Auto-select first available model when current selection is not in available list
  useEffect(() => {
    if (isLoadingFreeModels) return;

    const isCurrentModelAvailable = availableModels.some((m) => m.id === settings.selectedModelId);
    if (!isCurrentModelAvailable && availableModels.length > 0) {
      // Try to find a model for the current provider
      const modelsForProvider = settings.selectedProviderId 
        ? getModelsForProvider(settings.selectedProviderId)
        : availableModels;
      
      const newSelectedId = modelsForProvider[0]?.id || availableModels[0].id;
      setSettings((prev) => {
        const next = { ...prev, selectedModelId: newSelectedId };
        saveSettings(next);
        return next;
      });
    }
  }, [availableModels, settings.selectedModelId, settings.selectedProviderId, isLoadingFreeModels, getModelsForProvider]);

  // Selected model computed
  const selectedModel = useMemo(() => {
    // First check in available models
    const fromAvailable = availableModels.find((m) => m.id === settings.selectedModelId);
    if (fromAvailable) return fromAvailable;

    // Fallback to settings models
    return settings.models.find((m) => m.id === settings.selectedModelId);
  }, [availableModels, settings.models, settings.selectedModelId]);

  // API config actions
  const updateApiBase = useCallback((base: string) => {
    setSettings((prev) => {
      const next = { ...prev, apiBase: base };
      saveSettings(next);
      return next;
    });
  }, []);

  const updateApiKey = useCallback((key: string) => {
    setSettings((prev) => {
      const next = { ...prev, apiKey: key };
      saveSettings(next);
      return next;
    });
  }, []);

  // Model management actions
  const addModel = useCallback((model: Omit<ModelOption, 'id' | 'isBuiltIn'>): string => {
    const id = generateId();
    setSettings((prev) => {
      const newModel: ModelOption = {
        ...model,
        id,
        isBuiltIn: false,
      };
      const next = {
        ...prev,
        models: [...prev.models, newModel],
      };
      saveSettings(next);
      return next;
    });
    return id;
  }, []);

  const updateModel = useCallback((id: string, updates: Partial<Pick<ModelOption, 'value' | 'label'>>) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        models: prev.models.map((m) => (m.id === id ? { ...m, ...updates } : m)),
      };
      saveSettings(next);
      return next;
    });
  }, []);

  const deleteModel = useCallback((id: string) => {
    setSettings((prev) => {
      const model = prev.models.find((m) => m.id === id);
      // Cannot delete built-in models
      if (model?.isBuiltIn) return prev;

      const next = {
        ...prev,
        models: prev.models.filter((m) => m.id !== id),
        selectedModelId: prev.selectedModelId === id ? prev.models[0]?.id || '' : prev.selectedModelId,
      };
      saveSettings(next);
      return next;
    });
  }, []);

  const selectModel = useCallback((id: string) => {
    setSettings((prev) => {
      // Check if model exists in available models or settings models
      const exists = availableModels.some((m) => m.id === id) || prev.models.some((m) => m.id === id);
      if (!exists) return prev;
      
      // Also update provider if the model belongs to a different provider
      const model = availableModels.find((m) => m.id === id);
      const newProviderId = model?.providerId || prev.selectedProviderId;
      
      const next = { ...prev, selectedModelId: id, selectedProviderId: newProviderId };
      saveSettings(next);
      return next;
    });
  }, [availableModels]);

  // Provider management
  const selectProvider = useCallback((id: string) => {
    setSettings((prev: Settings) => {
      // Check if provider exists
      const exists = providers.some((p: Provider) => p.id === id);
      if (!exists) return prev;

      // Use provider's default model, or fallback to first model
      let newModelId = providerDefaultModels[id];
      if (!newModelId) {
        const modelsForProvider = freeModels.filter((m: ModelOption) => m.providerId === id);
        newModelId = modelsForProvider[0]?.id || prev.selectedModelId;
      }

      const next = { ...prev, selectedProviderId: id, selectedModelId: newModelId };
      saveSettings(next);
      return next;
    });
  }, [providers, freeModels, providerDefaultModels]);

  // Utility functions
  const getSelectedModelValue = useCallback(() => {
    return selectedModel?.value || defaultFreeModelId || '';
  }, [selectedModel, defaultFreeModelId]);

  const getModelOptions = useCallback(() => {
    // If a provider is selected, only show models for that provider
    if (settings.selectedProviderId) {
      const modelsForProvider = availableModels.filter(
        (m) => m.providerId === settings.selectedProviderId
      );
      if (modelsForProvider.length > 0) {
        return modelsForProvider.map((m) => ({ value: m.id, label: m.label }));
      }
    }
    // Fallback to all models
    return availableModels.map((m) => ({ value: m.id, label: m.label }));
  }, [availableModels, settings.selectedProviderId]);

  const getProviderOptions = useCallback(() => {
    return providers.map((p) => ({ value: p.id, label: p.name }));
  }, [providers]);

  return {
    settings,
    selectedModel,
    freeModels,
    isLoadingFreeModels,
    providers,
    selectedProvider,
    updateApiBase,
    updateApiKey,
    addModel,
    updateModel,
    deleteModel,
    selectModel,
    selectProvider,
    getModelsForProvider,
    getSelectedModelValue,
    getModelOptions,
    getProviderOptions,
  };
};
