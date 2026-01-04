export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { loadProviders, createOpenAIClient } from '@/services/llm';
import { callVolcesExperimentalChat } from '@/services/llm/volces-adapter';
import type { ProviderConfig } from '@/services/llm/providers';

/* =========================
 * Types
 * ========================= */

type Provider = ProviderConfig;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequestBody {
  messages: ChatMessage[];
  model?: string;
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  [key: string]: unknown;
}

/**
 * Provider priority:
 * 1. explicit provider:model
 * 2. NVIDIA (if exists)
 * 3. others in PROVIDERS order
 */
const providersMap = loadProviders();
const providersList: Provider[] = Object.values(providersMap);

function resolveProviderAndModel(model?: string) {
  if (!model) return {};

  if (model.includes(':')) {
    const [providerId, ...rest] = model.split(':');
    return {
      providerId: providerId.toLowerCase(),
      model: rest.join(':'),
    };
  }

  return { model };
}

/* =========================
 * Streaming
 * ========================= */

async function tryStreaming(
  provider: Provider,
  body: ChatRequestBody,
  overrideKey?: string
): Promise<ReadableStream<Uint8Array>> {
  const client = createOpenAIClient(provider, overrideKey);
  const modelToUse = body.model || provider.defaultModel || '';

  const stream = await client.chat.completions.create({
    messages: body.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    model: modelToUse,
    stream: true,
    temperature: body.temperature,
    max_tokens: body.max_tokens,
  });

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`)
          );
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/* =========================
 * Non-streaming
 * ========================= */

async function tryNonStreaming(
  provider: Provider,
  body: ChatRequestBody,
  overrideKey?: string
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const client = createOpenAIClient(provider, overrideKey);
  const modelToUse = body.model || provider.defaultModel || '';

  return await client.chat.completions.create({
    messages: body.messages as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
    model: modelToUse,
    stream: false,
    temperature: body.temperature,
    max_tokens: body.max_tokens,
  });
}

/* =========================
 * POST Handler
 * ========================= */

export async function POST(req: NextRequest) {
  const body = (await req.json()) as ChatRequestBody;
  const { providerId, model } = resolveProviderAndModel(body.model);

  const auth = req.headers.get('authorization');
  const clientKey =
    auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;

  /**
   * 🔥 Volces Experimental Chat (NO fallback)
   * Only for DeepSeek V3.2 / Kimi K2
   */
  if (providerId === 'volces-experimental') {
    const apiKey = clientKey || process.env.VOLCES_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: { message: 'Missing Volces API key' } },
        { status: 401 }
      );
    }

    try {
      const result = await callVolcesExperimentalChat({
        model: model || '',
        messages: body.messages,
        stream: body.stream,
        apiKey,
      });

      // Check if result is a ReadableStream (streaming response)
      if (result instanceof ReadableStream) {
        return new Response(result, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-LLM-Provider': 'volces-experimental',
            'X-LLM-Note': 'experimental',
          },
        });
      }

      // Non-streaming response
      return NextResponse.json(result, {
        headers: {
          'X-LLM-Provider': 'volces-experimental',
          'X-LLM-Note': 'experimental',
        },
      });
    } catch (err: unknown) {
      console.error('[VOLCES EXPERIMENTAL ERROR]', err);
      const errorMessage = err instanceof Error ? err.message : 'Volces experimental model failed';

      return NextResponse.json(
        {
          error: {
            message: errorMessage,
            provider: 'volces-experimental',
          },
        },
        { status: 500 }
      );
    }
  }

  /**
   * Build provider fallback chain
   */
  let chain: Provider[] = providersList;

  if (providerId && providersMap[providerId]) {
    chain = [
      providersMap[providerId],
      ...providersList.filter(p => p.id !== providerId),
    ];
  }

  if (chain.length === 0) {
    return NextResponse.json(
      { error: { message: 'No provider configured' } },
      { status: 500 }
    );
  }

  const requestBody: ChatRequestBody = {
    ...body,
    model,
  };

  let lastError: unknown = null;

  for (const provider of chain) {
    try {
      const forceStreaming = provider.id === 'nvidia';
      const streaming =
        forceStreaming || body.stream === true;

      if (streaming) {
        const readable = await tryStreaming(
          provider,
          requestBody,
          clientKey
        );

        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-LLM-Provider': provider.id,
          },
        });
      }

      const response = await tryNonStreaming(
        provider,
        requestBody,
        clientKey
      );

      return NextResponse.json(response, {
        headers: {
          'X-LLM-Provider': provider.id,
        },
      });
    } catch (err: unknown) {
      console.error(
        `[LLM FALLBACK] ${provider.id} failed`,
        err
      );
      lastError = err;
      continue;
    }
  }

  // All providers failed
  if (lastError instanceof OpenAI.APIError) {
    return NextResponse.json(
      {
        error: {
          message: lastError.message,
          code: lastError.code,
          provider: 'all_failed',
        },
      },
      { status: lastError.status || 500 }
    );
  }

  const errorMessage = lastError instanceof Error ? lastError.message : 'All providers failed';
  return NextResponse.json(
    {
      error: {
        message: errorMessage,
        provider: 'all_failed',
      },
    },
    { status: 500 }
  );
}
