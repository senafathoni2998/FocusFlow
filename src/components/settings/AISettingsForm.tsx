"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { setAIProvider, type AISettings } from "@/app/actions/settings"

/**
 * AI provider picker. Lists every supported provider; only ones with an API key
 * configured are selectable. The active provider is what the assistant/insights
 * will actually use after resolution (may differ from the stored preference if
 * that provider's key was removed). Optimistic select with a refresh-on-reject
 * guard, following the app's optimistic-UI convention.
 */
export default function AISettingsForm({ settings }: { settings: AISettings }) {
  const router = useRouter()
  // Seed the selection from the stored preference — but only if that provider is
  // still configured. If its key was removed, highlight the provider that's
  // actually active instead, so the highlighted row is never a disabled one that
  // disagrees with the "Active" badge.
  const preferenceConfigured = settings.providers.some(
    (p) => p.id === settings.preference && p.configured,
  )
  const [selected, setSelected] = useState<string>(
    (preferenceConfigured ? settings.preference : settings.activeProvider) ?? "",
  )
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const anyConfigured = settings.providers.some((p) => p.configured)

  const handleSelect = async (id: string, configured: boolean) => {
    if (!configured || saving || id === selected) return
    const previous = selected
    setSelected(id)
    setSaving(true)
    setStatus(null)
    try {
      const res = await setAIProvider(id)
      if (res?.error) {
        setSelected(previous)
        setStatus(res.error)
      } else {
        setStatus("Saved")
        router.refresh()
      }
    } catch {
      setSelected(previous)
      setStatus("Failed to save")
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-900">AI Provider</h2>
        {status && (
          <span
            className={`text-sm ${status === "Saved" ? "text-green-600" : "text-red-600"}`}
          >
            {status}
          </span>
        )}
      </div>

      {!anyConfigured && (
        <div className="mb-4 rounded-lg bg-warning-50 border border-warning-200 text-warning-800 text-sm px-3 py-2">
          No provider has an API key yet. Add one (e.g. <code>GROQ_API_KEY</code>)
          to your environment and restart to enable it.
        </div>
      )}

      <div className="space-y-2">
        {settings.providers.map((p) => {
          const isSelected = selected === p.id
          const isActive = settings.activeProvider === p.id
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelect(p.id, p.configured)}
              disabled={!p.configured || saving}
              aria-pressed={isSelected}
              className={`w-full text-left flex items-center gap-3 rounded-xl border px-4 py-3 transition ${
                isSelected
                  ? "border-primary-500 bg-primary-50"
                  : "border-gray-200 hover:bg-gray-50"
              } ${!p.configured ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
            >
              <span
                className={`w-4 h-4 rounded-full border flex-shrink-0 ${
                  isSelected ? "border-primary-500 bg-primary-500" : "border-gray-300"
                }`}
                aria-hidden
              />
              <span className="flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{p.label}</span>
                  {isActive && (
                    <span className="text-xs font-medium text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                      Active
                    </span>
                  )}
                </span>
                <span className="block text-xs text-gray-500 mt-0.5">
                  {p.configured ? (
                    <>Model: {p.model}</>
                  ) : (
                    <>
                      No API key —{" "}
                      <a
                        href={p.docsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        get one
                      </a>
                    </>
                  )}
                </span>
              </span>
              <span
                className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                  p.configured
                    ? "text-green-700 bg-green-100"
                    : "text-gray-500 bg-gray-100"
                }`}
              >
                {p.configured ? "Key set" : "No key"}
              </span>
            </button>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 mt-4">
        The selected provider is used for both the chat assistant and dashboard
        insights. API keys are read from environment variables and never shown here.
      </p>
    </div>
  )
}
