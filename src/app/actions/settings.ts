"use server"

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import {
  isValidProvider,
  listProviderStatus,
  resolveProviderId,
  type AIProviderId,
  type ProviderStatus,
} from "@/lib/aiProviders"

/**
 * User-facing AI settings. The single self-hosting user is effectively the admin,
 * so their stored `aiProvider` selects which provider powers the assistant +
 * insights. Follows the app convention: auth() → validate → mutate → revalidate.
 */

/** The caller's stored provider preference (null = fall back to env/default). */
export async function getUserAIProviderPref(): Promise<string | null> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return null

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { aiProvider: true },
    })
    return user?.aiProvider ?? null
  } catch {
    return null
  }
}

export interface AISettings {
  /** The raw stored preference (may be an unconfigured provider). */
  preference: string | null
  /** The provider that will ACTUALLY be used after resolution (null = none configured). */
  activeProvider: AIProviderId | null
  /** All providers with their configured/model status for the picker. */
  providers: ProviderStatus[]
}

export async function getAISettings(): Promise<AISettings> {
  // Explicit auth gate: this is a directly-invokable server action, and it would
  // otherwise disclose which providers have keys configured to any caller.
  const session = await auth()
  if (!session?.user?.id) {
    return { preference: null, activeProvider: null, providers: [] }
  }

  const preference = await getUserAIProviderPref()
  return {
    preference,
    activeProvider: resolveProviderId(preference),
    providers: listProviderStatus(),
  }
}

/** Persist the caller's preferred AI provider. */
export async function setAIProvider(providerId: string) {
  const session = await auth()
  if (!session?.user?.id) return { error: "Unauthorized" }
  if (!isValidProvider(providerId)) return { error: "Invalid provider" }

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { aiProvider: providerId },
    })
    revalidatePath("/settings")
    return { success: true }
  } catch {
    return { error: "Failed to update provider" }
  }
}
