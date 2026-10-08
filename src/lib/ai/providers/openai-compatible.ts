import { AiError, type ProviderResult } from '../types'
import { MAX_OUTPUT_TOKENS } from '../defaults'
import {
  mergeConsecutive,
  normalizeUsage,
  providerHttpError,
  toNetworkError,
  type ProviderArgs,
} from './shared'

interface OpenAiCompatibleResponse {
  choices?: { message?: { content?: string } }[]
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export async function generateOpenAiCompatible(
  endpointUrl: string,
  providerName: string,
  args: ProviderArgs,
  extraHeaders: Record<string, string> = {},
): Promise<ProviderResult> {
  const { apiKey, model, systemPrompt, messages, timeoutMs } = args

  let res: Response
  try {
    res = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          ...mergeConsecutive(messages),
        ],
        max_tokens: MAX_OUTPUT_TOKENS,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    throw toNetworkError(err)
  }

  if (!res.ok) {
    throw await providerHttpError(providerName, res)
  }

  const data = (await res.json().catch(() => null)) as OpenAiCompatibleResponse | null
  const text = data?.choices?.[0]?.message?.content
  if (!text || typeof text !== 'string' || !text.trim()) {
    throw new AiError(`${providerName} returned an empty response.`, {
      code: 'empty_response',
    })
  }

  const usage = normalizeUsage({
    prompt: data?.usage?.prompt_tokens,
    completion: data?.usage?.completion_tokens,
    total: data?.usage?.total_tokens,
  })

  return { text, usage }
}

export function generateGroq(args: ProviderArgs): Promise<ProviderResult> {
  return generateOpenAiCompatible('https://api.groq.com/openai/v1/chat/completions', 'Groq', args)
}

export function generateDeepSeek(args: ProviderArgs): Promise<ProviderResult> {
  return generateOpenAiCompatible('https://api.deepseek.com/chat/completions', 'DeepSeek', args)
}

export function generateOpenRouter(args: ProviderArgs): Promise<ProviderResult> {
  return generateOpenAiCompatible('https://openrouter.ai/api/v1/chat/completions', 'OpenRouter', args, {
    'HTTP-Referer': 'https://SKJCRM.app',
    'X-Title': 'SKJCRM',
  })
}
