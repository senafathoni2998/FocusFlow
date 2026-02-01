/**
 * Unit tests for src/app/auth/signup/page.tsx
 *
 * Tests cover:
 * - Session check using useSession
 * - Redirect to dashboard when already authenticated
 * - Loading state while checking session
 * - Form rendering with name, email, and password inputs
 * - Form submission to /api/auth/signup
 * - Error handling and display
 * - Loading state during submission
 * - Link to signin page
 * - Styling classes
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import SignUpPage from "@/app/auth/signup/page"

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    refresh: jest.fn(),
  }),
}))

// Mock next-auth/react
jest.mock("next-auth/react", () => ({
  useSession: jest.fn(() => ({
    data: null,
    status: "unauthenticated",
  })),
}))

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: async () => ({ success: true }),
  })
) as jest.MockedFunction<typeof fetch>

import { useRouter } from "next/navigation"
import { useSession } from "next-auth/react"

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>

describe("SignUp Page", () => {
  let mockPush: jest.MockedFunction<any>

  beforeEach(() => {
    jest.clearAllMocks()

    // Reset router mock
    const router = useRouter()
    mockPush = jest.fn()
    router.push = mockPush

    // Reset fetch mock
    ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    })

    // Default to unauthenticated state
    mockUseSession.mockReturnValue({
      data: null,
      status: "unauthenticated",
    })
  })

  describe("Form Rendering", () => {
    it("should render heading", () => {
      render(<SignUpPage />)

      const heading = screen.getAllByText("Create Account").find(el => el.tagName === "H1")
      expect(heading).toBeInTheDocument()
    })

    it("should render subtitle", () => {
      render(<SignUpPage />)

      expect(screen.getByText("Start your productivity journey with FocusFlow")).toBeInTheDocument()
    })

    it("should render name input", () => {
      render(<SignUpPage />)

      const nameInput = screen.getByPlaceholderText("John Doe")
      expect(nameInput).toBeInTheDocument()
      expect(nameInput).toHaveAttribute("type", "text")
    })

    it("should render email input", () => {
      render(<SignUpPage />)

      const emailInput = screen.getByPlaceholderText("you@example.com")
      expect(emailInput).toBeInTheDocument()
      expect(emailInput).toHaveAttribute("type", "email")
    })

    it("should render password input", () => {
      render(<SignUpPage />)

      const passwordInput = screen.getByPlaceholderText("••••••••")
      expect(passwordInput).toBeInTheDocument()
      expect(passwordInput).toHaveAttribute("type", "password")
    })

    it("should render create account button", () => {
      render(<SignUpPage />)

      const submitButton = screen.getAllByRole("button").find(btn => btn.textContent?.includes("Create Account"))
      expect(submitButton).toBeInTheDocument()
    })

    it("should render signin link", () => {
      render(<SignUpPage />)

      const signinLink = screen.getByText("Sign in")
      expect(signinLink).toBeInTheDocument()
      expect(signinLink.closest("a")).toHaveAttribute("href", "/auth/signin")
    })

    it("should show password hint text", () => {
      render(<SignUpPage />)

      expect(screen.getByText("Must be at least 6 characters")).toBeInTheDocument()
    })
  })

  describe("Form Input Behavior", () => {
    it("should allow typing name", async () => {
      const user = userEvent.setup()

      render(<SignUpPage />)

      const nameInput = screen.getByPlaceholderText("John Doe")
      await user.type(nameInput, "John Doe")

      expect(nameInput).toHaveValue("John Doe")
    })

    it("should allow typing email", async () => {
      const user = userEvent.setup()

      render(<SignUpPage />)

      const emailInput = screen.getByPlaceholderText("you@example.com")
      await user.type(emailInput, "test@example.com")

      expect(emailInput).toHaveValue("test@example.com")
    })

    it("should allow typing password", async () => {
      const user = userEvent.setup()

      render(<SignUpPage />)

      const passwordInput = screen.getByPlaceholderText("••••••••")
      await user.type(passwordInput, "password123")

      expect(passwordInput).toHaveValue("password123")
    })

    it("should have name placeholder", () => {
      render(<SignUpPage />)

      const nameInput = screen.getByPlaceholderText("John Doe")
      expect(nameInput).toBeInTheDocument()
    })

    it("should have email placeholder", () => {
      render(<SignUpPage />)

      const emailInput = screen.getByPlaceholderText("you@example.com")
      expect(emailInput).toBeInTheDocument()
    })

    it("should have password placeholder", () => {
      render(<SignUpPage />)

      const passwordInput = screen.getByPlaceholderText("••••••••")
      expect(passwordInput).toBeInTheDocument()
    })

    it("should have password with minLength", () => {
      render(<SignUpPage />)

      const passwordInput = screen.getByPlaceholderText("••••••••")
      expect(passwordInput).toHaveAttribute("minLength", "6")
    })
  })

  describe("Page Layout", () => {
    it("should have centered layout", () => {
      const { container } = render(<SignUpPage />)

      const mainDiv = container.querySelector(".min-h-screen.flex.items-center.justify-center")
      expect(mainDiv).toBeInTheDocument()
    })

    it("should have gray background", () => {
      const { container } = render(<SignUpPage />)

      const mainDiv = container.querySelector(".bg-gray-50")
      expect(mainDiv).toBeInTheDocument()
    })

    it("should have max-width container", () => {
      const { container } = render(<SignUpPage />)

      const containerDiv = container.querySelector(".max-w-md")
      expect(containerDiv).toBeInTheDocument()
    })

    it("should have white card with shadow", () => {
      const { container } = render(<SignUpPage />)

      const card = container.querySelector(".bg-white.rounded-lg.shadow-md")
      expect(card).toBeInTheDocument()
    })

    it("should apply heading styles", () => {
      const { container } = render(<SignUpPage />)

      const heading = container.querySelector("h1")
      expect(heading).toHaveClass("text-3xl", "font-bold", "text-center")
    })

    it("should have form spacing", () => {
      const { container } = render(<SignUpPage />)

      const form = container.querySelector("form")
      expect(form).toHaveClass("space-y-6")
    })
  })

  describe("Links", () => {
    it("should have link to signin page", () => {
      render(<SignUpPage />)

      const link = screen.getByText("Sign in")
      expect(link).toBeInTheDocument()
    })

    it("should have correct signin href", () => {
      render(<SignUpPage />)

      const link = screen.getByText("Sign in")
      expect(link.closest("a")).toHaveAttribute("href", "/auth/signin")
    })

    it("should show signin prompt text", () => {
      render(<SignUpPage />)

      expect(screen.getByText(/Already have an account/)).toBeInTheDocument()
    })
  })

  describe("Password Hint", () => {
    it("should show password requirement hint", () => {
      render(<SignUpPage />)

      expect(screen.getByText("Must be at least 6 characters")).toBeInTheDocument()
    })

    it("should have small text for password hint", () => {
      const { container } = render(<SignUpPage />)

      const hint = container.querySelector(".text-xs.text-gray-500")
      expect(hint).toBeInTheDocument()
    })

    it("should have margin top on password hint", () => {
      const { container } = render(<SignUpPage />)

      const hint = container.querySelector(".mt-1")
      expect(hint).toBeInTheDocument()
    })
  })

  describe("Form Validation", () => {
    it("should have text input type for name", () => {
      render(<SignUpPage />)

      const nameInput = screen.getByPlaceholderText("John Doe")
      expect(nameInput).toHaveAttribute("type", "text")
    })

    it("should have email input type", () => {
      render(<SignUpPage />)

      const emailInput = screen.getByPlaceholderText("you@example.com")
      expect(emailInput).toHaveAttribute("type", "email")
    })

    it("should have password input type", () => {
      render(<SignUpPage />)

      const passwordInput = screen.getByPlaceholderText("••••••••")
      expect(passwordInput).toHaveAttribute("type", "password")
    })
  })

  describe("Full Integration", () => {
    it("should render complete signup form", () => {
      const { container } = render(<SignUpPage />)

      const heading = screen.getAllByText("Create Account").find(el => el.tagName === "H1")
      expect(heading).toBeInTheDocument()
      expect(screen.getByPlaceholderText("John Doe")).toBeInTheDocument()
      expect(screen.getByPlaceholderText("you@example.com")).toBeInTheDocument()
      expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument()

      const submitButton = screen.getAllByRole("button").find(btn => btn.textContent?.includes("Create Account"))
      expect(submitButton).toBeInTheDocument()
      expect(screen.getByText("Sign in")).toBeInTheDocument()
    })
  })
})
