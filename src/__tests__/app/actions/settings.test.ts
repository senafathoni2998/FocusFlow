/**
 * Unit tests for src/app/actions/settings.ts (AI provider settings).
 */

jest.mock("openai", () => ({ __esModule: true, default: jest.fn(() => ({})) }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))

const mockAuth = jest.fn()
jest.mock("@/lib/auth", () => ({ auth: (...a: any[]) => mockAuth(...a) }))

const mockUserFindUnique = jest.fn()
const mockUserUpdate = jest.fn()
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: (...a: any[]) => mockUserFindUnique(...a),
      update: (...a: any[]) => mockUserUpdate(...a),
    },
  },
}))

import {
  getUserAIProviderPref,
  getAISettings,
  setAIProvider,
} from "@/app/actions/settings"

const ALL_ENV = [
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "DEEPSEEK_API_KEY",
  "GEMINI_API_KEY",
  "AI_PROVIDER",
]

describe("settings actions", () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
    for (const k of ALL_ENV) delete process.env[k]
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe("getUserAIProviderPref", () => {
    it("returns null with no session and never queries", async () => {
      mockAuth.mockResolvedValue(null)
      expect(await getUserAIProviderPref()).toBeNull()
      expect(mockUserFindUnique).not.toHaveBeenCalled()
    })
    it("returns the stored aiProvider", async () => {
      mockAuth.mockResolvedValue({ user: { id: "u1" } })
      mockUserFindUnique.mockResolvedValue({ aiProvider: "openai" })
      expect(await getUserAIProviderPref()).toBe("openai")
    })
    it("returns null when the user has no preference", async () => {
      mockAuth.mockResolvedValue({ user: { id: "u1" } })
      mockUserFindUnique.mockResolvedValue({ aiProvider: null })
      expect(await getUserAIProviderPref()).toBeNull()
    })
  })

  describe("getAISettings", () => {
    it("returns preference, resolved active provider, and provider statuses", async () => {
      process.env.GROQ_API_KEY = "g"
      mockAuth.mockResolvedValue({ user: { id: "u1" } })
      mockUserFindUnique.mockResolvedValue({ aiProvider: null })

      const s = await getAISettings()

      expect(s.preference).toBeNull()
      expect(s.activeProvider).toBe("groq") // resolved via the default
      expect(s.providers.find((p) => p.id === "groq")!.configured).toBe(true)
    })
    it("resolves the active provider to the stored preference", async () => {
      process.env.GROQ_API_KEY = "g"
      process.env.OPENAI_API_KEY = "o"
      mockAuth.mockResolvedValue({ user: { id: "u1" } })
      mockUserFindUnique.mockResolvedValue({ aiProvider: "openai" })

      const s = await getAISettings()

      expect(s.preference).toBe("openai")
      expect(s.activeProvider).toBe("openai")
    })
    it("activeProvider is null when nothing is configured", async () => {
      mockAuth.mockResolvedValue({ user: { id: "u1" } })
      mockUserFindUnique.mockResolvedValue({ aiProvider: null })

      const s = await getAISettings()

      expect(s.activeProvider).toBeNull()
    })
    it("returns an empty, key-free payload when unauthenticated", async () => {
      mockAuth.mockResolvedValue(null)

      const s = await getAISettings()

      expect(s).toEqual({ preference: null, activeProvider: null, providers: [] })
      expect(mockUserFindUnique).not.toHaveBeenCalled()
    })
  })

  describe("setAIProvider", () => {
    it("rejects when unauthenticated", async () => {
      mockAuth.mockResolvedValue(null)
      expect(await setAIProvider("openai")).toEqual({ error: "Unauthorized" })
      expect(mockUserUpdate).not.toHaveBeenCalled()
    })
    it("rejects an invalid provider id", async () => {
      mockAuth.mockResolvedValue({ user: { id: "u1" } })
      expect(await setAIProvider("bogus")).toEqual({ error: "Invalid provider" })
      expect(mockUserUpdate).not.toHaveBeenCalled()
    })
    it("persists a valid provider", async () => {
      mockAuth.mockResolvedValue({ user: { id: "u1" } })
      mockUserUpdate.mockResolvedValue({})

      const res = await setAIProvider("anthropic")

      expect(res).toEqual({ success: true })
      expect(mockUserUpdate).toHaveBeenCalledWith({
        where: { id: "u1" },
        data: { aiProvider: "anthropic" },
      })
    })
  })
})
