/**
 * Type definitions for BetterPrompt
 */

// Analysis table row for optimization results
export interface AnalysisTableRow {
  dimension: string;
  originalIssue: string;
  optimized: string;
}

// Optimization result from LLM
export interface OptimizationResult {
  optimizedPrompt: {
    zh: string;
    en: string;
  };
  score: number;
  roast: string;
  optimizationDetails: Array<{
    change: string;
    effect: string;
  }>;
  diagnosis: string[];
  analysisTable?: AnalysisTableRow[];
}

// History item stored in localStorage
export interface HistoryItem {
  id: string;
  timestamp: number;
  originalPrompt: string;
  result: OptimizationResult;
}

// Provider configuration
export interface Provider {
  id: string;
  name: string;
  /** API base URL */
  baseUrl: string;
  /** Whether this provider is configured (has API key) */
  isConfigured: boolean;
}

// Model option for model selector
export interface ModelOption {
  id: string;
  value: string;
  label: string;
  isBuiltIn: boolean;
  /** Models that don't require custom API configuration */
  noApiRequired?: boolean;
  /** Provider ID this model belongs to */
  providerId?: string;
}

// Settings stored in localStorage
export interface Settings {
  apiBase: string;
  apiKey: string;
  models: ModelOption[];
  selectedModelId: string;
  /** Selected provider ID */
  selectedProviderId?: string;
}

// Prompt template for customization
export interface PromptTemplate {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  userPromptTemplate: string;
  isDefault: boolean;
  createdAt: number;
  updatedAt: number;
}

// API configuration for dynamic endpoint and auth
export interface ApiConfig {
  apiBase?: string;
  apiKey?: string;
}

// Prompt template options for API calls
export interface PromptOptions {
  systemPrompt?: string;
  userPromptTemplate?: string;
}

// User role
export type UserRole = 'admin' | 'user';

// User interface
export interface User {
  id: string;
  username: string;
  password: string; // Hashed password
  role: UserRole;
  createdAt: number;
  updatedAt: number;
}

// User without password (for frontend)
export interface UserInfo {
  id: string;
  username: string;
  role: UserRole;
  createdAt: number;
  updatedAt: number;
}

// Login request
export interface LoginRequest {
  username: string;
  password: string;
}

// Login response
export interface LoginResponse {
  success: boolean;
  message?: string;
  user?: UserInfo;
  token?: string;
}

// User management request
export interface CreateUserRequest {
  username: string;
  password: string;
  role?: UserRole;
}

export interface UpdateUserRequest {
  username?: string;
  password?: string;
  currentPassword?: string; // Required when user changes own password
}
