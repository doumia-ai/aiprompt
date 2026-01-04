export const runtime = 'nodejs';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { loadProviders, createOpenAIClient } from '@/services/llm';
import { callVolcesExperimentalChat } from '@/services/llm/volces-adapter';

/**
 * Provider priority:
 * 1. explicit provider:model
 * 2. NVIDIA (if exists)
 * 3. others in PROVIDERS order
 */
const providersMap = loadProviders();
const providersList = Object.values(providersMap);

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

async function tryStreaming(
  provider,
  body,
  overrideKey?: string
) {
  const client = createOpenAIClient(provider, overrideKey);

  const stream = await client.chat.completions.create({
    ...body,
    model: body.model || provider.defaultModel,
    stream: true,
  } as OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming);

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

async function tryNonStreaming(
  provider,
  body,
  overrideKey?: string
) {
  const client = createOpenAIClient(provider, overrideKey);

  return await client.chat.completions.create({
    ...body,
    model: body.model || provider.defaultModel,
    stream: false,
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
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
      if (body.stream === true) {
        const readable = await callVolcesExperimentalChat({
          model,
          messages: body.messages,
          stream: true,
          apiKey,
        });

        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
            'X-LLM-Provider': 'volces-experimental',
            'X-LLM-Note': 'experimental',
          },
        });
      }

      const result = await callVolcesExperimentalChat({
        model,
        messages: body.messages,
        apiKey,
      });

      return NextResponse.json(result, {
        headers: {
          'X-LLM-Provider': 'volces-experimental',
          'X-LLM-Note': 'experimental',
        },
      });
    } catch (err: any) {
      console.error('[VOLCES EXPERIMENTAL ERROR]', err);

      return NextResponse.json(
        {
          error: {
            message:
              err?.message || 'Volces experimental model failed',
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
  let chain = providersList;

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

  const requestBody = {
    ...body,
    model,
  };

  let lastError: any = null;

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
    } catch (err: any) {
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

  return NextResponse.json(
    {
      error: {
        message:
          lastError?.message || 'All providers failed',
        provider: 'all_failed',
      },
    },
    { status: 500 }
  );
}

