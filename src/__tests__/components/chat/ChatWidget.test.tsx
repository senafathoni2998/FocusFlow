/**
 * Unit tests for src/components/chat/ChatWidget.tsx
 *
 * Tests cover:
 * - Floating action button (FAB) rendering
 * - Chat window open/close state
 * - Header with title and close button
 * - Empty state with welcome message
 * - Suggestions loading and display
 * - Message sending to /api/chat
 * - Keyboard shortcuts (Enter to send, Shift+Enter for newline)
 * - Auto-resize textarea
 * - Loading state during message send
 * - Error handling for failed messages
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import ChatWidget from "@/components/chat/ChatWidget"

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: async () => ({
      message: "This is a test response",
      functionCall: null,
    }),
  })
) as jest.MockedFunction<typeof fetch>

// Mock router
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: jest.fn(),
  }),
}))

// Mock lib functions
jest.mock("@/lib/chatAssistant", () => ({
  getSuggestedActions: jest.fn(() => Promise.resolve(["Create a new task", "Show my tasks"])),
}))

jest.mock("@/lib/taskEvents", () => ({
  dispatchTaskUpdate: jest.fn(),
}))

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return []
  }
  unobserve() {}
} as any

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
} as any

// Mock Element.prototype.scrollIntoView for the ref
Element.prototype.scrollIntoView = jest.fn()

describe("ChatWidget Component", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Floating Action Button (FAB)", () => {
    it("should render floating action button", () => {
      render(<ChatWidget />)

      const fab = screen.getByRole("button", { name: /open chat assistant/i })
      expect(fab).toBeInTheDocument()
    })

    it("should apply primary color to FAB", () => {
      const { container } = render(<ChatWidget />)

      const fab = container.querySelector(".bg-primary-600")
      expect(fab).toBeInTheDocument()
    })

    it("should apply hover effect to FAB", () => {
      const { container } = render(<ChatWidget />)

      const fab = container.querySelector(".hover\\:bg-primary-700")
      expect(fab).toBeInTheDocument()
    })

    it("should have fixed position at bottom right", () => {
      const { container } = render(<ChatWidget />)

      const fab = container.querySelector(".fixed.bottom-6.right-6")
      expect(fab).toBeInTheDocument()
    })

    it("should have rounded full shape", () => {
      const { container } = render(<ChatWidget />)

      const fab = container.querySelector(".rounded-full")
      expect(fab).toBeInTheDocument()
    })

    it("should have proper dimensions", () => {
      const { container } = render(<ChatWidget />)

      const fab = container.querySelector(".w-14.h-14")
      expect(fab).toBeInTheDocument()
    })

    it("should have shadow", () => {
      const { container } = render(<ChatWidget />)

      const fab = container.querySelector(".shadow-lg")
      expect(fab).toBeInTheDocument()
    })

    it("should have hover scale effect", () => {
      const { container } = render(<ChatWidget />)

      const fab = container.querySelector(".hover\\:scale-110")
      expect(fab).toBeInTheDocument()
    })
  })

  describe("Chat Window State", () => {
    it("should not render chat window when closed", () => {
      render(<ChatWidget />)

      expect(screen.queryByRole("heading", { name: "FocusFlow Assistant" })).not.toBeInTheDocument()
    })

    it("should open chat window when FAB is clicked", async () => {
      const user = userEvent.setup()
      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      expect(screen.getByRole("heading", { name: "FocusFlow Assistant" })).toBeInTheDocument()
    })

    it("should close chat window when close button is clicked", async () => {
      const user = userEvent.setup()
      render(<ChatWidget />)

      // Open chat
      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))
      expect(screen.getByRole("heading", { name: "FocusFlow Assistant" })).toBeInTheDocument()

      // Close chat
      await user.click(screen.getByRole("button", { name: /close chat/i }))

      await waitFor(() => {
        expect(screen.queryByRole("heading", { name: "FocusFlow Assistant" })).not.toBeInTheDocument()
      })
    })

    it("should render chat window with white background", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const chatWindow = container.querySelector(".bg-white.rounded-2xl")
      expect(chatWindow).toBeInTheDocument()
    })
  })

  describe("Chat Header", () => {
    it("should render header with FocusFlow Assistant title", async () => {
      const user = userEvent.setup()
      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      expect(screen.getByRole("heading", { name: "FocusFlow Assistant" })).toBeInTheDocument()
    })

    it("should render subtitle 'Manage tasks with AI'", async () => {
      const user = userEvent.setup()
      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      expect(screen.getByText("Manage tasks with AI")).toBeInTheDocument()
    })

    it("should render close button in header", async () => {
      const user = userEvent.setup()
      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      expect(screen.getByRole("button", { name: /close chat/i })).toBeInTheDocument()
    })

    it("should apply primary color background to header", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const header = container.querySelector(".bg-primary-600")
      expect(header).toBeInTheDocument()
    })

    it("should apply white text color to header", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const header = container.querySelector(".text-white")
      expect(header).toBeInTheDocument()
    })

    it("should apply rounded top corners to header", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const header = container.querySelector(".rounded-t-2xl")
      expect(header).toBeInTheDocument()
    })

    it("should have bell icon in header", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const bellIcon = container.querySelector(".bg-white\\/20.rounded-full")
      expect(bellIcon).toBeInTheDocument()
    })
  })

  describe("Empty State", () => {
    it("should show welcome message when no messages", async () => {
      const user = userEvent.setup()
      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      expect(screen.getByText("Welcome to FocusFlow Assistant!")).toBeInTheDocument()
    })

    it("should show helper text when no messages", async () => {
      const user = userEvent.setup()
      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      expect(screen.getByText(/I can help you manage your tasks/)).toBeInTheDocument()
    })

    it("should show suggestion buttons", async () => {
      const user = userEvent.setup()
      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      expect(screen.getByText("Create a new task")).toBeInTheDocument()
      expect(screen.getByText("Show my tasks")).toBeInTheDocument()
    })

    it("should not show empty state after sending message", async () => {
      const user = userEvent.setup()
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => ({
          message: "Response",
          functionCall: null,
        }),
      })

      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))
      expect(screen.getByText(/Welcome to FocusFlow Assistant!/)).toBeInTheDocument()

      const textarea = screen.getByPlaceholderText(/Type a message/i)
      await user.type(textarea, "Hello")
      await user.click(screen.getByRole("button", { name: /send message/i }))

      await waitFor(() => {
        expect(screen.queryByText(/Welcome to FocusFlow Assistant!/)).not.toBeInTheDocument()
      })
    })
  })

  describe("Suggestions", () => {
    it("should display suggestion buttons", async () => {
      const user = userEvent.setup()
      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const suggestionButton = screen.getByText("Create a new task")
      expect(suggestionButton).toBeInTheDocument()
    })

    it("should send message when suggestion is clicked", async () => {
      const user = userEvent.setup()
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => ({
          message: "Creating task...",
          functionCall: null,
        }),
      })

      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const suggestionButton = screen.getByText("Create a new task")
      await user.click(suggestionButton)

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })
    })
  })

  describe("Message Input Area", () => {
    it("should render textarea input", async () => {
      const user = userEvent.setup()
      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i)
      expect(textarea).toBeInTheDocument()
    })

    it("should render send button", async () => {
      const user = userEvent.setup()
      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      expect(screen.getByRole("button", { name: /send message/i })).toBeInTheDocument()
    })

    it("should allow typing in textarea", async () => {
      const user = userEvent.setup()
      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i) as HTMLTextAreaElement
      await user.type(textarea, "Hello, how are you?")

      expect(textarea.value).toBe("Hello, how are you?")
    })

    it("should clear textarea after sending message", async () => {
      const user = userEvent.setup()
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => ({
          message: "Response",
          functionCall: null,
        }),
      })

      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i) as HTMLTextAreaElement
      await user.type(textarea, "Test message")
      await user.click(screen.getByRole("button", { name: /send message/i }))

      await waitFor(() => {
        expect(textarea.value).toBe("")
      })
    })
  })

  describe("Keyboard Shortcuts", () => {
    it("should send message with Enter key", async () => {
      const user = userEvent.setup()
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => ({
          message: "Response",
          functionCall: null,
        }),
      })

      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i)
      await user.type(textarea, "Test message")
      await user.keyboard("{Enter}")

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled()
      })
    })

    it("should add newline with Shift+Enter", async () => {
      const user = userEvent.setup()
      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i) as HTMLTextAreaElement
      await user.type(textarea, "Line 1")
      await user.keyboard("{Shift>}{Enter}{/Shift}")
      await user.type(textarea, "Line 2")

      expect(textarea.value).toContain("\n")
      expect(textarea.value).toBe("Line 1\nLine 2")
    })

    it("should not send on Enter when textarea is empty", async () => {
      const user = userEvent.setup()
      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i)
      await user.keyboard("{Enter}")

      expect(global.fetch).not.toHaveBeenCalled()
    })
  })

  describe("Message Sending", () => {
    it("should call /api/chat endpoint when sending message", async () => {
      const user = userEvent.setup()
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => ({
          message: "This is a response",
          functionCall: null,
        }),
      })

      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i)
      await user.type(textarea, "Test message")
      await user.click(screen.getByRole("button", { name: /send message/i }))

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: expect.stringContaining("Test message"),
        })
      })
    })

    it("should display user message after sending", async () => {
      const user = userEvent.setup()
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => ({
          message: "Response",
          functionCall: null,
        }),
      })

      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i)
      await user.type(textarea, "My message")
      await user.click(screen.getByRole("button", { name: /send message/i }))

      await waitFor(() => {
        expect(screen.getByText("My message")).toBeInTheDocument()
      })
    })

    it("should display assistant response", async () => {
      const user = userEvent.setup()
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockResolvedValue({
        ok: true,
        json: async () => ({
          message: "Here is the answer",
          functionCall: null,
        }),
      })

      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i)
      await user.type(textarea, "Question")
      await user.click(screen.getByRole("button", { name: /send message/i }))

      await waitFor(() => {
        expect(screen.getByText("Here is the answer")).toBeInTheDocument()
      })
    })

    it("should send message history with new message", async () => {
      const user = userEvent.setup()
      let callCount = 0

      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            message: `Response ${++callCount}`,
            functionCall: null,
          }),
        })
      )

      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i)

      // Send first message
      await user.type(textarea, "First message")
      await user.click(screen.getByRole("button", { name: /send message/i }))

      await waitFor(() => {
        expect(screen.getByText("First message")).toBeInTheDocument()
      })

      // Send second message
      await user.type(textarea, "Second message")
      await user.click(screen.getByRole("button", { name: /send message/i }))

      await waitFor(() => {
        expect((global.fetch as jest.Mock).mock.calls[1]?.[1]?.body).toContain("First message")
      })
    })
  })

  describe("Loading States", () => {
    it("should show loading indicator while waiting for response", async () => {
      const user = userEvent.setup()
      let resolveFetch: (value: any) => void

      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(() =>
        new Promise((resolve) => {
          resolveFetch = resolve
        })
      )

      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i)
      await user.type(textarea, "Test")
      await user.click(screen.getByRole("button", { name: /send message/i }))

      await waitFor(() => {
        const loadingDots = document.querySelectorAll(".w-2.h-2.bg-gray-400.rounded-full.animate-bounce")
        expect(loadingDots).toHaveLength(3)
      })

      resolveFetch!({
        ok: true,
        json: async () => ({ message: "Done", functionCall: null }),
      })
    })

    it("should disable send button while loading", async () => {
      const user = userEvent.setup()
      let resolveFetch: (value: any) => void

      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(() =>
        new Promise((resolve) => {
          resolveFetch = resolve
        })
      )

      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i)
      await user.type(textarea, "Test")
      await user.click(screen.getByRole("button", { name: /send message/i }))

      await waitFor(() => {
        const sendButton = screen.getByRole("button", { name: /send message/i })
        expect(sendButton).toBeDisabled()
      })

      resolveFetch!({
        ok: true,
        json: async () => ({ message: "Done", functionCall: null }),
      })
    })

    it("should disable textarea while loading", async () => {
      const user = userEvent.setup()
      let resolveFetch: (value: any) => void

      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(() =>
        new Promise((resolve) => {
          resolveFetch = resolve
        })
      )

      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i) as HTMLTextAreaElement
      await user.type(textarea, "Test")
      await user.click(screen.getByRole("button", { name: /send message/i }))

      await waitFor(() => {
        expect(textarea).toBeDisabled()
      })

      resolveFetch!({
        ok: true,
        json: async () => ({ message: "Done", functionCall: null }),
      })
    })

    it("should show spinner in send button while loading", async () => {
      const user = userEvent.setup()
      let resolveFetch: (value: any) => void

      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(() =>
        new Promise((resolve) => {
          resolveFetch = resolve
        })
      )

      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i)
      await user.type(textarea, "Test")
      await user.click(screen.getByRole("button", { name: /send message/i }))

      await waitFor(() => {
        const spinner = document.querySelector(".animate-spin")
        expect(spinner).toBeInTheDocument()
      })

      resolveFetch!({
        ok: true,
        json: async () => ({ message: "Done", functionCall: null }),
      })
    })
  })

  describe("Error Handling", () => {
    it("should display error message when API call fails", async () => {
      const user = userEvent.setup()
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(() =>
        Promise.reject(new Error("Network error"))
      )

      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i)
      await user.type(textarea, "Test")
      await user.click(screen.getByRole("button", { name: /send message/i }))

      await waitFor(() => {
        expect(screen.getByText(/Sorry, something went wrong/)).toBeInTheDocument()
      })
    })

    it("should allow retry after error", async () => {
      const user = userEvent.setup()
      let callCount = 0

      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          return Promise.reject(new Error("Network error"))
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ message: "Success", functionCall: null }),
        })
      })

      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i)
      await user.type(textarea, "Test")
      await user.click(screen.getByRole("button", { name: /send message/i }))

      await waitFor(() => {
        expect(screen.getByText(/Sorry, something went wrong/)).toBeInTheDocument()
      })

      // Type a new message and retry
      await user.type(textarea, "Retry")
      await user.click(screen.getByRole("button", { name: /send message/i }))

      await waitFor(() => {
        expect(screen.getByText("Success")).toBeInTheDocument()
      })
    })
  })

  describe("Chat Window Styling", () => {
    it("should have fixed positioning", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const chatWindow = container.querySelector(".fixed.bottom-6.right-6")
      expect(chatWindow).toBeInTheDocument()
    })

    it("should have proper width", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const chatWindow = container.querySelector(".w-96")
      expect(chatWindow).toBeInTheDocument()
    })

    it("should have max width for responsiveness", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const chatWindow = container.querySelector(".max-w-\\[calc\\(100vw-3rem\\)\\]")
      expect(chatWindow).toBeInTheDocument()
    })

    it("should have height", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const chatWindow = container.querySelector(".h-\\[500px\\]")
      expect(chatWindow).toBeInTheDocument()
    })

    it("should have max height", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const chatWindow = container.querySelector(".max-h-\\[calc\\(100vh-6rem\\)\\]")
      expect(chatWindow).toBeInTheDocument()
    })

    it("should have flex layout", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const chatWindow = container.querySelector(".flex.flex-col")
      expect(chatWindow).toBeInTheDocument()
    })

    it("should have border", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const chatWindow = container.querySelector(".border")
      expect(chatWindow).toBeInTheDocument()
    })
  })

  describe("Messages Container", () => {
    it("should render messages container", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const messagesContainer = container.querySelector(".flex-1.overflow-y-auto")
      expect(messagesContainer).toBeInTheDocument()
    })
  })

  describe("Input Area Styling", () => {
    it("should have border top", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const inputArea = container.querySelector(".border-t")
      expect(inputArea).toBeInTheDocument()
    })

    it("should apply padding to input area", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const inputArea = container.querySelector(".px-4.py-3")
      expect(inputArea).toBeInTheDocument()
    })
  })

  describe("Textarea Styling", () => {
    it("should have flex-1 to take available space", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = container.querySelector("textarea.flex-1")
      expect(textarea).toBeInTheDocument()
    })

    it("should have gray background", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = container.querySelector("textarea.bg-gray-100")
      expect(textarea).toBeInTheDocument()
    })

    it("should have border", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = container.querySelector("textarea.border")
      expect(textarea).toBeInTheDocument()
    })

    it("should have rounded corners", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = container.querySelector("textarea.rounded-2xl")
      expect(textarea).toBeInTheDocument()
    })

    it("should not be resizable", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = container.querySelector("textarea.resize-none")
      expect(textarea).toBeInTheDocument()
    })

    it("should have minHeight", async () => {
      const user = userEvent.setup()
      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i) as HTMLTextAreaElement
      expect(textarea.style.minHeight).toBe("40px")
    })

    it("should have maxHeight", async () => {
      const user = userEvent.setup()
      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i) as HTMLTextAreaElement
      expect(textarea.style.maxHeight).toBe("128px")
    })
  })

  describe("Send Button Styling", () => {
    it("should have primary color", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const sendButton = container.querySelector(".bg-primary-600")
      expect(sendButton).toBeInTheDocument()
    })

    it("should have hover effect", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const sendButton = container.querySelector(".hover\\:bg-primary-700")
      expect(sendButton).toBeInTheDocument()
    })

    it("should have disabled state styling", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const sendButton = container.querySelector(".disabled\\:bg-gray-300")
      expect(sendButton).toBeInTheDocument()
    })

    it("should have rounded shape", async () => {
      const user = userEvent.setup()
      const { container } = render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const sendButton = container.querySelector(".rounded-full")
      expect(sendButton).toBeInTheDocument()
    })
  })

  describe("Accessibility", () => {
    it("should have proper ARIA labels", async () => {
      const user = userEvent.setup()
      render(<ChatWidget />)

      const fab = screen.getByRole("button", { name: /open chat assistant/i })
      expect(fab).toBeInTheDocument()

      await user.click(fab)

      const closeButton = screen.getByRole("button", { name: /close chat/i })
      expect(closeButton).toBeInTheDocument()

      const sendButton = screen.getByRole("button", { name: /send message/i })
      expect(sendButton).toBeInTheDocument()
    })

    it("should associate textarea with placeholder", async () => {
      const user = userEvent.setup()
      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i)
      expect(textarea).toBeInTheDocument()
    })
  })

  describe("Full Integration", () => {
    it("should complete full chat flow", async () => {
      const user = userEvent.setup()
      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            message: "This is a helpful response!",
            functionCall: null,
          }),
        })
      )

      render(<ChatWidget />)

      // Initial state - FAB visible, chat closed
      expect(screen.getByRole("button", { name: /open chat assistant/i })).toBeInTheDocument()
      expect(screen.queryByRole("heading", { name: "FocusFlow Assistant" })).not.toBeInTheDocument()

      // Open chat
      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))
      expect(screen.getByRole("heading", { name: "FocusFlow Assistant" })).toBeInTheDocument()
      expect(screen.getByText(/Welcome to FocusFlow Assistant!/)).toBeInTheDocument()

      // Send message
      const textarea = screen.getByPlaceholderText(/Type a message/i)
      await user.type(textarea, "Hello AI")
      await user.click(screen.getByRole("button", { name: /send message/i }))

      // Check user message displayed
      await waitFor(() => {
        expect(screen.getByText("Hello AI")).toBeInTheDocument()
      })

      // Check assistant response
      await waitFor(() => {
        expect(screen.getByText("This is a helpful response!")).toBeInTheDocument()
      })

      // Check empty state is gone
      expect(screen.queryByText(/Welcome to FocusFlow Assistant!/)).not.toBeInTheDocument()

      // Close chat
      await user.click(screen.getByRole("button", { name: /close chat/i }))
      await waitFor(() => {
        expect(screen.queryByRole("heading", { name: "FocusFlow Assistant" })).not.toBeInTheDocument()
      })
    })

    it("should handle multiple messages in conversation", async () => {
      const user = userEvent.setup()
      let callCount = 0

      ;(global.fetch as jest.MockedFunction<typeof fetch>).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            message: `Response ${++callCount}`,
            functionCall: null,
          }),
        })
      )

      render(<ChatWidget />)

      await user.click(screen.getByRole("button", { name: /open chat assistant/i }))

      const textarea = screen.getByPlaceholderText(/Type a message/i)

      // Send first message
      await user.type(textarea, "Message 1")
      await user.click(screen.getByRole("button", { name: /send message/i }))

      await waitFor(() => {
        expect(screen.getByText("Message 1")).toBeInTheDocument()
        expect(screen.getByText("Response 1")).toBeInTheDocument()
      })

      // Send second message
      await user.type(textarea, "Message 2")
      await user.click(screen.getByRole("button", { name: /send message/i }))

      await waitFor(() => {
        expect(screen.getByText("Message 2")).toBeInTheDocument()
        expect(screen.getByText("Response 2")).toBeInTheDocument()
      })

      // All messages should be visible
      expect(screen.getByText("Message 1")).toBeInTheDocument()
      expect(screen.getByText("Response 1")).toBeInTheDocument()
      expect(screen.getByText("Message 2")).toBeInTheDocument()
      expect(screen.getByText("Response 2")).toBeInTheDocument()
    })
  })
})
