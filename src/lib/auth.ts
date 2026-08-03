import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { compare } from "bcryptjs"
import { findUserByEmail, normalizeEmail } from "./email"
import { clientKey, rateLimit, LOGIN_LIMIT } from "./rateLimit"
import { z } from "zod"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      authorize: async (credentials, request) => {
        const parsedCredentials = z
          .object({ email: z.string().trim().email(), password: z.string().min(6) })
          .safeParse(credentials)

        if (!parsedCredentials.success) return null

        const { email, password } = parsedCredentials.data

        // Throttle before touching bcrypt. Returning null (rather than throwing)
        // keeps the response identical to a wrong password, so the limiter can't
        // be used to probe which accounts exist — and the caller simply sees the
        // normal "invalid credentials" path until the window resets.
        const ip = request instanceof Request ? clientKey(request) : "unknown"
        if (!rateLimit(`login:ip:${ip}`, LOGIN_LIMIT).allowed) return null
        if (!rateLimit(`login:acct:${normalizeEmail(email)}`, LOGIN_LIMIT).allowed) return null

        // Case-insensitive: the address the user types is not guaranteed to match
        // the case stored at signup.
        const user = await findUserByEmail(email)

        if (!user) return null

        const passwordsMatch = await compare(password, user.password)
        if (!passwordsMatch) return null

        return { id: user.id, email: user.email, name: user.name }
      }
    })
  ],
  pages: {
    signIn: "/auth/signin"
  },
  session: {
    strategy: "jwt"
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string
      }
      return session
    }
  }
})
