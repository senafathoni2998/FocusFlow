import OpenAI from "openai"

/**
 * Multi-provider AI registry. Every supported provider exposes an OpenAI-SDK
 * compatible chat/completions endpoint, so we keep a single code path and only
 * vary { baseURL, apiKey, model } per provider. Function calling uses the modern
 * `tools`/`tool_calls` shape, which all of these accept (the legacy
 * `functions`/`function_call` shape is NOT accepted by Gemini/Anthropic's compat
 * layers, which is why the chat route migrated to `tools`).
 *
 * Selection: a per-user preference (User.aiProvider) → the AI_PROVIDER env →
 * `groq` default. A provider is only usable if its API key env var is set.
 */

export type AIProviderId = "groq" | "openai" | "anthropic" | "deepseek" | "gemini"

export const AI_PROVIDER_IDS: AIProviderId[] = [
  "groq",
  "openai",
  "anthropic",
  "deepseek",
  "gemini",
]

export const DEFAULT_PROVIDER: AIProviderId = "groq"

interface ProviderDef {
  id: AIProviderId
  label: string
  apiKeyEnv: string
  modelEnv: string
  insightsModelEnv: string
  /** undefined → OpenAI's default base URL. */
  baseURL?: string
  defaultChatModel: string
  defaultInsightsModel: string
  docsUrl: string
}

const PROVIDERS: Record<AIProviderId, ProviderDef> = {
  groq: {
    id: "groq",
    label: "Groq (Llama)",
    apiKeyEnv: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    insightsModelEnv: "GROQ_INSIGHTS_MODEL",
    baseURL: "https://api.groq.com/openai/v1",
    defaultChatModel: "llama-3.3-70b-versatile",
    defaultInsightsModel: "llama-3.1-8b-instant",
    docsUrl: "https://console.groq.com/",
  },
  openai: {
    id: "openai",
    label: "OpenAI (GPT)",
    apiKeyEnv: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    insightsModelEnv: "OPENAI_INSIGHTS_MODEL",
    baseURL: undefined,
    defaultChatModel: "gpt-4o-mini",
    defaultInsightsModel: "gpt-4o-mini",
    docsUrl: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    id: "anthropic",
    label: "Claude (Anthropic)",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    insightsModelEnv: "ANTHROPIC_INSIGHTS_MODEL",
    // Anthropic's OpenAI-compatibility endpoint (accepts the OpenAI SDK + tools).
    baseURL: "https://api.anthropic.com/v1/",
    defaultChatModel: "claude-3-5-haiku-latest",
    defaultInsightsModel: "claude-3-5-haiku-latest",
    docsUrl: "https://console.anthropic.com/",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "DEEPSEEK_MODEL",
    insightsModelEnv: "DEEPSEEK_INSIGHTS_MODEL",
    baseURL: "https://api.deepseek.com",
    defaultChatModel: "deepseek-chat",
    defaultInsightsModel: "deepseek-chat",
    docsUrl: "https://platform.deepseek.com/",
  },
  gemini: {
    id: "gemini",
    label: "Gemini (Google)",
    apiKeyEnv: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    insightsModelEnv: "GEMINI_INSIGHTS_MODEL",
    // Google's OpenAI-compatibility endpoint.
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultChatModel: "gemini-2.0-flash",
    defaultInsightsModel: "gemini-2.0-flash",
    docsUrl: "https://aistudio.google.com/apikey",
  },
}

export function isValidProvider(id?: string | null): id is AIProviderId {
  return !!id && (AI_PROVIDER_IDS as string[]).includes(id)
}

function apiKeyFor(def: ProviderDef): string {
  return (process.env[def.apiKeyEnv] || "").trim()
}

/** An env override wins only if it's non-empty after trimming; else the default. */
function resolveModel(envVar: string, fallback: string): string {
  return (process.env[envVar] || "").trim() || fallback
}

/** Whether a provider has an API key configured (env var set + non-empty). */
export function isProviderConfigured(id: AIProviderId): boolean {
  return apiKeyFor(PROVIDERS[id]).length > 0
}

/**
 * Resolve which provider should actually be used. Preference order:
 *   1. the caller's preference (valid + configured)
 *   2. the AI_PROVIDER env (valid + configured)
 *   3. the `groq` default (configured)
 *   4. the first configured provider, whatever it is
 * Returns null when NO provider has a key — callers surface a friendly error.
 */
export function resolveProviderId(preferred?: string | null): AIProviderId | null {
  const envPref = process.env.AI_PROVIDER
  const ordered: (AIProviderId | undefined)[] = [
    isValidProvider(preferred) ? preferred : undefined,
    isValidProvider(envPref) ? envPref : undefined,
    DEFAULT_PROVIDER,
  ]
  for (const c of ordered) {
    if (c && isProviderConfigured(c)) return c
  }
  return AI_PROVIDER_IDS.find(isProviderConfigured) ?? null
}

export interface ResolvedAIClient {
  client: OpenAI
  providerId: AIProviderId
  label: string
  chatModel: string
  insightsModel: string
}

/**
 * Build an OpenAI-SDK client for the resolved provider, or null when no provider
 * is configured. Model can be overridden per provider via the *_MODEL env vars.
 */
export function getAIClient(preferred?: string | null): ResolvedAIClient | null {
  const id = resolveProviderId(preferred)
  if (!id) return null

  const def = PROVIDERS[id]
  const client = new OpenAI({
    apiKey: apiKeyFor(def),
    ...(def.baseURL ? { baseURL: def.baseURL } : {}),
  })

  return {
    client,
    providerId: id,
    label: def.label,
    chatModel: resolveModel(def.modelEnv, def.defaultChatModel),
    insightsModel: resolveModel(def.insightsModelEnv, def.defaultInsightsModel),
  }
}

/** Public-safe provider metadata for the settings UI (never exposes keys). */
export interface ProviderStatus {
  id: AIProviderId
  label: string
  configured: boolean
  docsUrl: string
  model: string
}

export function listProviderStatus(): ProviderStatus[] {
  return AI_PROVIDER_IDS.map((id) => {
    const def = PROVIDERS[id]
    return {
      id,
      label: def.label,
      configured: isProviderConfigured(id),
      docsUrl: def.docsUrl,
      model: resolveModel(def.modelEnv, def.defaultChatModel),
    }
  })
}
