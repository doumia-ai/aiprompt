/**
 * LLM API Proxy Route
 *
 * Uses OpenAI SDK to forward requests to the backend LLM service
 * Supports streaming responses and multiple providers
 *
 * Environment variables:
 * - PROVIDERS: Comma-separated list of provider IDs
 * - {PROVIDER}_BASE_URL: Provider API base URL
 * - {PROVIDER}_API_KEY: Provider API key
 * 
 * Legacy (backward compatible):
 * - LLM_BACKEND_URL: Backend API base URL
 * - LLM_API_KEY: Backend API key
 */

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Provider configuration interface
interface ProviderConfig {
  id: string;
  baseUrl: string;
  apiKey: string;
}

// Get provider configuration from environment
function getProviderConfig(providerId?: string): ProviderConfig | null {
  // If providerId specified, try to get that provider's config
  if (providerId && providerId !== 'default') {
    const upperProviderId = providerId.toUpperCase();
    const baseUrl = process.env[`${upperProviderId}_BASE_URL`];
    const apiKey = process.env[`${upperProviderId}_API_KEY`] || '';

    if (baseUrl) {
      return { id: providerId, baseUrl, apiKey };
    }
  }

  // Fallback to legacy single-provider config
  const legacyBaseUrl = process.env.LLM_BACKEND_URL || '';
  const legacyApiKey = process.env.LLM_API_KEY || '';

  if (legacyBaseUrl) {
    return { id: 'default', baseUrl: legacyBaseUrl, apiKey: legacyApiKey };
  }

  return null;
}

// Get base URL (remove /chat/completions if present)
function getBaseUrl(url: string): string {
  if (url.endsWith('/chat/completions')) {
    return url.slice(0, -'/chat/completions'.length);
  }
  return url;
}

// Create OpenAI client for a specific provider
function createClient(provider: ProviderConfig, clientApiKey?: string): OpenAI {
  const baseURL = getBaseUrl(provider.baseUrl);
  const key = clientApiKey || provider.apiKey;

  return new OpenAI({
    apiKey: key || 'dummy',
    baseURL,
    timeout: 120000,
    maxRetries: 2,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Extract provider ID from model string (format: "providerId:modelId" or just "modelId")
    let providerId: string | undefined;
    let modelId = body.model;
    
    if (body.model && body.model.includes(':')) {
      const parts = body.model.split(':');
      providerId = parts[0];
      modelId = parts.slice(1).join(':');
    }

    // Also check for explicit provider header
    const headerProviderId = request.headers.get('X-Provider-Id');
    if (headerProviderId) {
      providerId = headerProviderId;
    }

    // Get provider configuration
    const provider = getProviderConfig(providerId);
    
    if (!provider) {
      return NextResponse.json(
        { 
          error: { 
            message: 'LLM backend not configured. Set provider environment variables or LLM_BACKEND_URL.', 
            type: 'config_error' 
          } 
        },
        { status: 500 }
      );
    }

    // Check if client provided their own API key
    const clientAuth = request.headers.get('Authorization');
    const clientApiKey = clientAuth?.startsWith('Bearer ') ? clientAuth.slice(7) : undefined;
    // Ignore placeholder keys
    const effectiveClientKey = clientApiKey && !clientApiKey.startsWith('dummy') && !clientApiKey.startsWith('sk-placeholder')
      ? clientApiKey
      : undefined;

    const client = createClient(provider, effectiveClientKey);
    const isStreaming = body.stream === true;

    // Update model in request body to use actual model ID (without provider prefix)
    const requestBody = { ...body, model: modelId };

    if (isStreaming) {
      // Streaming response
      const stream = await client.chat.completions.create({
        ...requestBody,
        stream: true,
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming);

      // Convert to SSE format
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of stream) {
              const data = JSON.stringify(chunk);
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          } catch (error) {
            console.error('[LLM Proxy] Stream error:', error);
            controller.error(error);
          }
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      // Non-streaming response
      const response = await client.chat.completions.create({
        ...requestBody,
        stream: false,
      });
      return NextResponse.json(response);
    }
  } catch (error) {
    console.error('[LLM Proxy] Error:', error);

    if (error instanceof OpenAI.APIError) {
      return NextResponse.json(
        { error: { message: error.message, type: 'api_error', code: error.code } },
        { status: error.status || 500 }
      );
    }

    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : 'Internal server error',
          type: 'proxy_error',
        },
      },
      { status: 500 }
    );
  }
}

// Handle OPTIONS for CORS
// Note: In production, consider restricting Access-Control-Allow-Origin to specific domains
export async function OPTIONS(request: NextRequest) {
  const origin = request.headers.get('origin') || '';

  // Allow same-origin requests and localhost for development
  const allowedOrigins = [
    process.env.ALLOWED_ORIGIN, // Set this in production
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ].filter(Boolean);

  const isAllowed = allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development';

  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': isAllowed ? origin : '',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Provider-Id',
    },
  });
}
