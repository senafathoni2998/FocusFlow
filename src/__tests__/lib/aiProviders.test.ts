/**
 * Unit tests for src/lib/aiProviders.ts — the multi-provider AI registry.
 */

// Keep `new OpenAI()` inert.
jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn(() => ({})),
}))

import {
  isValidProvider,
  isProviderConfigured,
  resolveProviderId,
  getAIClient,
  listProviderStatus,
  AI_PROVIDER_IDS,
  DEFAULT_PROVIDER,
} from "@/lib/aiProviders"

const ALL_ENV = [
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "DEEPSEEK_API_KEY",
  "GEMINI_API_KEY",
  "AI_PROVIDER",
  "GROQ_MODEL",
  "OPENAI_MODEL",
  "GROQ_INSIGHTS_MODEL",
]

describe("aiProviders", () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
    for (const k of ALL_ENV) delete process.env[k]
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe("isValidProvider", () => {
    it("accepts every registered id", () => {
      for (const id of AI_PROVIDER_IDS) expect(isValidProvider(id)).toBe(true)
    })
    it("rejects unknown / empty values", () => {
      expect(isValidProvider("bogus")).toBe(false)
      expect(isValidProvider(null)).toBe(false)
      expect(isValidProvider(undefined)).toBe(false)
      expect(isValidProvider("")).toBe(false)
    })
  })

  describe("isProviderConfigured", () => {
    it("is false with no key and true once the env var is set", () => {
      expect(isProviderConfigured("openai")).toBe(false)
      process.env.OPENAI_API_KEY = "sk-x"
      expect(isProviderConfigured("openai")).toBe(true)
    })
    it("treats a whitespace-only key as unconfigured", () => {
      process.env.GROQ_API_KEY = "   "
      expect(isProviderConfigured("groq")).toBe(false)
    })
  })

  describe("resolveProviderId", () => {
    it("returns null when nothing is configured", () => {
      expect(resolveProviderId()).toBeNull()
      expect(resolveProviderId("openai")).toBeNull()
    })
    it("prefers a valid + configured caller preference", () => {
      process.env.GROQ_API_KEY = "g"
      process.env.OPENAI_API_KEY = "o"
      expect(resolveProviderId("openai")).toBe("openai")
    })
    it("ignores a preference whose key is missing and falls back to default", () => {
      process.env.GROQ_API_KEY = "g"
      expect(resolveProviderId("openai")).toBe("groq")
    })
    it("honors AI_PROVIDER env when there is no caller preference", () => {
      process.env.OPENAI_API_KEY = "o"
      process.env.AI_PROVIDER = "openai"
      expect(resolveProviderId()).toBe("openai")
    })
    it("falls back to the groq default when it is configured", () => {
      process.env.GROQ_API_KEY = "g"
      expect(resolveProviderId()).toBe(DEFAULT_PROVIDER)
    })
    it("uses any configured provider as a last resort", () => {
      process.env.DEEPSEEK_API_KEY = "d"
      expect(resolveProviderId()).toBe("deepseek")
    })
    it("ignores an invalid preference string", () => {
      process.env.GROQ_API_KEY = "g"
      expect(resolveProviderId("bogus")).toBe("groq")
    })
  })

  describe("getAIClient", () => {
    it("returns null when no provider is configured", () => {
      expect(getAIClient()).toBeNull()
    })
    it("returns a client + default models for the resolved provider", () => {
      process.env.GROQ_API_KEY = "g"
      const ai = getAIClient()
      expect(ai).not.toBeNull()
      expect(ai!.providerId).toBe("groq")
      expect(ai!.chatModel).toBe("llama-3.3-70b-versatile")
      expect(ai!.insightsModel).toBe("llama-3.1-8b-instant")
      expect(ai!.client).toBeDefined()
    })
    it("honors *_MODEL env overrides", () => {
      process.env.OPENAI_API_KEY = "o"
      process.env.OPENAI_MODEL = "gpt-4o"
      const ai = getAIClient("openai")
      expect(ai!.chatModel).toBe("gpt-4o")
    })
    it("falls back to the default model when the *_MODEL override is whitespace", () => {
      process.env.GROQ_API_KEY = "g"
      process.env.GROQ_MODEL = "   "
      const ai = getAIClient()
      expect(ai!.chatModel).toBe("llama-3.3-70b-versatile")
    })
  })

  describe("listProviderStatus", () => {
    it("lists all providers with configured flags and never leaks keys", () => {
      process.env.GROQ_API_KEY = "g"
      const list = listProviderStatus()
      expect(list).toHaveLength(AI_PROVIDER_IDS.length)
      expect(list.find((p) => p.id === "groq")!.configured).toBe(true)
      expect(list.find((p) => p.id === "openai")!.configured).toBe(false)
      for (const p of list) {
        expect(p).not.toHaveProperty("apiKey")
        expect(p).not.toHaveProperty("apiKeyEnv")
      }
    })
  })
})
