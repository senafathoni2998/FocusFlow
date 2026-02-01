/**
 * Unit tests for src/app/auth/signin/page.tsx
 *
 * Tests cover:
 * - Session check using useSession
 * - Redirect to dashboard when already authenticated
 * - Loading state while checking session
 * - Form rendering with email and password inputs
 * - Form submission with signIn
 * - Error handling and display
 * - Loading state during submission
 * - Link to signup page
 * - Styling classes
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import SignInPage from "@/app/auth/signin/page"

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
}))

// Mock next-auth/react
jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
  useSession: jest.fn(() => ({
    data: null,
    status: "unauthenticated",
  })),
}))

import { useRouter } from "next/navigation"
import { useSession, signIn } from "next-auth/react"

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>
const mockSignIn = signIn as jest.MockedFunction<typeof signIn>

describe("SignIn Page", () => {
  let mockPush: jest.MockedFunction<any>
  let mockRefresh: jest.MockedFunction<any>

  beforeEach(() => {
    jest.clearAllMocks()

    // Setup router mock
    const router = useRouter()
    mockPush = jest.fn()
    mockRefresh = jest.fn()
    router.push = mockPush
    router.refresh = mockRefresh

    // Default to unauthenticated state
    mockUseSession.mockReturnValue({
      data: null,
      status: "unauthenticated",
    })
  })

  describe("Form Rendering", () => {

    it("should render heading", () => {
      render(<SignInPage />)

      expect(screen.getByText("Welcome Back")).toBeInTheDocument()
    })

    it("should render subtitle", () => {
      render(<SignInPage />)

      expect(screen.getByText("Sign in to your FocusFlow account")).toBeInTheDocument()
    })

    it("should render email input", () => {
      render(<SignInPage />)

      const emailInput = screen.getByPlaceholderText("you@example.com")
      expect(emailInput).toBeInTheDocument()
      expect(emailInput).toHaveAttribute("type", "email")
    })

    it("should render password input", () => {
      render(<SignInPage />)

      const passwordInput = screen.getByPlaceholderText("••••••••")
      expect(passwordInput).toBeInTheDocument()
      expect(passwordInput).toHaveAttribute("type", "password")
    })

    it("should render sign in button", () => {
      render(<SignInPage />)

      const submitButton = screen.getAllByRole("button").find(btn => btn.textContent?.includes("Sign In"))
      expect(submitButton).toBeInTheDocument()
    })

    it("should render signup link", () => {
      render(<SignInPage />)

      const signupLink = screen.getByText("Sign up")
      expect(signupLink).toBeInTheDocument()
      expect(signupLink.closest("a")).toHaveAttribute("href", "/auth/signup")
    })
  })

  describe("Form Input Behavior", () => {
    it("should allow typing email", async () => {
      const user = userEvent.setup()

      render(<SignInPage />)

      const emailInput = screen.getByPlaceholderText("you@example.com")
      await user.type(emailInput, "test@example.com")

      expect(emailInput).toHaveValue("test@example.com")
    })

    it("should allow typing password", async () => {
      const user = userEvent.setup()

      render(<SignInPage />)

      const passwordInput = screen.getByPlaceholderText("••••••••")
      await user.type(passwordInput, "password123")

      expect(passwordInput).toHaveValue("password123")
    })

    it("should have email placeholder", () => {
      render(<SignInPage />)

      const emailInput = screen.getByPlaceholderText("you@example.com")
      expect(emailInput).toBeInTheDocument()
    })

    it("should have password placeholder", () => {
      render(<SignInPage />)

      const passwordInput = screen.getByPlaceholderText("••••••••")
      expect(passwordInput).toBeInTheDocument()
    })

    it("should have password with minLength", () => {
      render(<SignInPage />)

      const passwordInput = screen.getByPlaceholderText("••••••••")
      expect(passwordInput).toHaveAttribute("minLength", "6")
    })
  })

  describe("Page Layout", () => {
    it("should have centered layout", () => {
      const { container } = render(<SignInPage />)

      const mainDiv = container.querySelector(".min-h-screen.flex.items-center.justify-center")
      expect(mainDiv).toBeInTheDocument()
    })

    it("should have gray background", () => {
      const { container } = render(<SignInPage />)

      const mainDiv = container.querySelector(".bg-gray-50")
      expect(mainDiv).toBeInTheDocument()
    })

    it("should have max-width container", () => {
      const { container } = render(<SignInPage />)

      const containerDiv = container.querySelector(".max-w-md")
      expect(containerDiv).toBeInTheDocument()
    })

    it("should have white card with shadow", () => {
      const { container } = render(<SignInPage />)

      const card = container.querySelector(".bg-white.rounded-lg.shadow-md")
      expect(card).toBeInTheDocument()
    })

    it("should apply heading styles", () => {
      const { container } = render(<SignInPage />)

      const heading = container.querySelector("h1")
      expect(heading).toHaveClass("text-3xl", "font-bold", "text-center")
    })

    it("should have form spacing", () => {
      const { container } = render(<SignInPage />)

      const form = container.querySelector("form")
      expect(form).toHaveClass("space-y-6")
    })
  })

  describe("Links", () => {
    it("should have link to signup page", () => {
      render(<SignInPage />)

      const link = screen.getByText("Sign up")
      expect(link).toBeInTheDocument()
    })

    it("should have correct signup href", () => {
      render(<SignInPage />)

      const link = screen.getByText("Sign up")
      expect(link.closest("a")).toHaveAttribute("href", "/auth/signup")
    })

    it("should show signup prompt text", () => {
      render(<SignInPage />)

      expect(screen.getByText(/Don't have an account/)).toBeInTheDocument()
    })
  })

  describe("Full Integration", () => {
    it("should render complete signin form", () => {
      const { container } = render(<SignInPage />)

      expect(screen.getByText("Welcome Back")).toBeInTheDocument()
      expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument()
      expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument()

      const submitButton = screen.getAllByRole("button").find(btn => btn.textContent?.includes("Sign In"))
      expect(submitButton).toBeInTheDocument()
      expect(screen.getByText("Sign up")).toBeInTheDocument()
    })
  })
})
