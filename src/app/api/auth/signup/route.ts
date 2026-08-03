import { NextResponse } from "next/server"
import { hash } from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { findUserByEmail, normalizeEmail } from "@/lib/email"
import { clientKey, rateLimit, REGISTER_LIMIT } from "@/lib/rateLimit"
import { z } from "zod"

const signupSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(6),
  name: z.string().optional()
})

export async function POST(request: Request) {
  try {
    // Same cap as the mobile register endpoint — both create accounts and neither
    // requires a session, so throttling one and not the other protects nothing.
    const limited = rateLimit(`register:ip:${clientKey(request)}`, REGISTER_LIMIT)
    if (!limited.allowed) {
      return NextResponse.json(
        { error: "Too many attempts. Try again later." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
      )
    }

    const body = await request.json()
    const { email: rawEmail, password, name } = signupSchema.parse(body)
    // Canonical on write, case-insensitive on the duplicate check — email is a
    // case-insensitive identifier but User.email is a case-sensitive column.
    const email = normalizeEmail(rawEmail)

    // Check if user already exists
    const existingUser = await findUserByEmail(email)

    if (existingUser) {
      return NextResponse.json(
        { error: "User already exists" },
        { status: 400 }
      )
    }

    // Hash password
    const hashedPassword = await hash(password, 10)

    // Create user
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name
      }
    })

    return NextResponse.json(
      { message: "User created successfully", userId: user.id },
      { status: 201 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
