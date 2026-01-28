"use client"

import { signOut } from "next-auth/react"

export async function logout() {
  await signOut({ redirectTo: "/" })
}
