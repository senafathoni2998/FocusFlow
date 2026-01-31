import { auth } from "@/lib/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const { pathname } = req.nextUrl
  const isLoggedIn = !!req.auth

  // Redirect authenticated users away from auth pages
  if (isLoggedIn && (pathname.startsWith("/auth/signin") || pathname.startsWith("/auth/signup"))) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
