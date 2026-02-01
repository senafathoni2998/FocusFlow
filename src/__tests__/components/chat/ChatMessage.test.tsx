/**
 * Unit tests for src/components/chat/ChatMessage.tsx
 *
 * Tests cover:
 * - User message rendering
 * - Assistant message rendering
 * - Avatar display (user icon vs bell icon)
 * - Message bubble styling and colors
 * - Markdown formatting (bold, line breaks)
 * - Loading indicator with bouncing dots
 * - Timestamp display
 */

import { render, screen } from "@testing-library/react"
import ChatMessage from "@/components/chat/ChatMessage"

describe("ChatMessage Component", () => {
  describe("User Message Rendering", () => {
    it("should render user message container", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Hello, how are you?"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const messageContainer = container.querySelector(".flex-row-reverse")
      expect(messageContainer).toBeInTheDocument()
    })

    it("should display user icon avatar", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Test message"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const avatar = container.querySelector(".bg-primary-600.text-white.rounded-full")
      expect(avatar).toBeInTheDocument()
    })

    it("should apply primary color to user message bubble", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Test message"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const messageBubble = container.querySelector(".bg-primary-600")
      expect(messageBubble).toBeInTheDocument()
    })

    it("should apply white text color to user message", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Test message"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const messageBubble = container.querySelector(".text-white")
      expect(messageBubble).toBeInTheDocument()
    })

    it("should apply rounded-br-sm to user message bubble", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Test message"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const messageBubble = container.querySelector(".rounded-br-sm")
      expect(messageBubble).toBeInTheDocument()
    })
  })

  describe("Assistant Message Rendering", () => {
    it("should render assistant message container", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content="Hi! I'm doing great, thanks for asking!"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const messageContainer = container.querySelector(".flex-row:not(.flex-row-reverse)")
      expect(messageContainer).toBeInTheDocument()
    })

    it("should display bell icon avatar", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content="Test message"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const avatar = container.querySelector(".bg-gray-200")
      expect(avatar).toBeInTheDocument()
    })

    it("should apply gray background to assistant message bubble", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content="Test message"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const messageBubble = container.querySelector(".bg-gray-100")
      expect(messageBubble).toBeInTheDocument()
    })

    it("should apply gray text color to assistant message", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content="Test message"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const messageBubble = container.querySelector(".text-gray-800")
      expect(messageBubble).toBeInTheDocument()
    })

    it("should apply rounded-bl-sm to assistant message bubble", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content="Test message"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const messageBubble = container.querySelector(".rounded-bl-sm")
      expect(messageBubble).toBeInTheDocument()
    })
  })

  describe("Message Content Display", () => {
    it("should display user message content", () => {
      render(
        <ChatMessage
          role="user"
          content="This is a test message"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      expect(screen.getByText("This is a test message")).toBeInTheDocument()
    })

    it("should display assistant message content", () => {
      render(
        <ChatMessage
          role="assistant"
          content="This is an assistant response"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      expect(screen.getByText("This is an assistant response")).toBeInTheDocument()
    })

    it("should handle empty message content", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content=""
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const messageBubble = container.querySelector(".rounded-2xl")
      expect(messageBubble).toBeInTheDocument()
    })

    it("should handle long message content", () => {
      const longMessage = "This is a very long message that spans multiple lines. ".repeat(10)
      render(
        <ChatMessage
          role="user"
          content={longMessage}
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      expect(screen.getByText((content) => content.includes("very long message"))).toBeInTheDocument()
    })

    it("should handle special characters in message", () => {
      render(
        <ChatMessage
          role="user"
          content="Message with <special> & characters"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      expect(screen.getByText(/Message with/)).toBeInTheDocument()
    })
  })

  describe("Markdown Formatting", () => {
    it("should format bold text in user messages", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="This has **bold text** in it"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const boldElement = container.querySelector("strong")
      expect(boldElement).toBeInTheDocument()
      expect(boldElement?.textContent).toBe("bold text")
    })

    it("should format bold text in assistant messages", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content="Here is **important** information"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const boldElement = container.querySelector("strong")
      expect(boldElement).toBeInTheDocument()
      expect(boldElement?.textContent).toBe("important")
    })

    it("should handle multiple bold sections", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="**First** and **second** bold parts"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const boldElements = container.querySelectorAll("strong")
      expect(boldElements).toHaveLength(2)
      expect(boldElements[0]?.textContent).toBe("First")
      expect(boldElements[1]?.textContent).toBe("second")
    })

    it("should convert line breaks to <br />", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content={`Line 1
Line 2
Line 3`}
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const messageContent = container.querySelector(".text-sm.leading-relaxed")
      expect(messageContent?.innerHTML).toMatch(/<br\s*\/?>/)
    })

    it("should handle bold with line breaks", () => {
      render(
        <ChatMessage
          role="assistant"
          content="**Bold**\nNew line"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      expect(screen.getByText("Bold")).toBeInTheDocument()
    })
  })

  describe("Avatar Display", () => {
    it("should render user avatar with correct classes", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Test"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const avatar = container.querySelector(".w-8.h-8.rounded-full.flex.items-center.justify-center.bg-primary-600")
      expect(avatar).toBeInTheDocument()
    })

    it("should render assistant avatar with correct classes", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content="Test"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const avatar = container.querySelector(".w-8.h-8.rounded-full.flex.items-center.justify-center.bg-gray-200")
      expect(avatar).toBeInTheDocument()
    })

    it("should display user icon SVG in avatar", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Test"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const svg = container.querySelector(".bg-primary-600 svg")
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveAttribute("viewBox", "0 0 20 20")
    })

    it("should display assistant bell SVG in avatar", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content="Test"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const svg = container.querySelector(".bg-gray-200 svg")
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveAttribute("viewBox", "0 0 20 20")
    })
  })

  describe("Loading Indicator", () => {
    it("should show loading indicator when isLoading is true", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content=""
          timestamp={new Date("2024-01-01T10:00:00Z")}
          isLoading
        />
      )

      const loadingContainer = container.querySelector(".flex.gap-1.items-center")
      expect(loadingContainer).toBeInTheDocument()
    })

    it("should render three bouncing dots", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content=""
          timestamp={new Date("2024-01-01T10:00:00Z")}
          isLoading
        />
      )

      const dots = container.querySelectorAll(".w-2.h-2.bg-gray-400.rounded-full.animate-bounce")
      expect(dots).toHaveLength(3)
    })

    it("should apply animation delays to dots", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content=""
          timestamp={new Date("2024-01-01T10:00:00Z")}
          isLoading
        />
      )

      const dots = container.querySelectorAll(".w-2.h-2.bg-gray-400.rounded-full.animate-bounce")
      expect(dots[0]?.style.animationDelay).toBe("0ms")
      expect(dots[1]?.style.animationDelay).toBe("150ms")
      expect(dots[2]?.style.animationDelay).toBe("300ms")
    })

    it("should not show content when loading", () => {
      render(
        <ChatMessage
          role="assistant"
          content="This should not show"
          timestamp={new Date("2024-01-01T10:00:00Z")}
          isLoading
        />
      )

      expect(screen.queryByText("This should not show")).not.toBeInTheDocument()
    })

    it("should not show timestamp when loading", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content=""
          timestamp={new Date("2024-01-01T10:00:00Z")}
          isLoading
        />
      )

      const timestamp = container.querySelector(".text-xs.mt-1")
      expect(timestamp).not.toBeInTheDocument()
    })
  })

  describe("Timestamp Display", () => {
    it("should display formatted timestamp for user message", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Test"
          timestamp={new Date("2024-01-01T10:30:00Z")}
        />
      )

      // Check that timestamp element exists and has text content
      const timestamp = container.querySelector(".text-xs.mt-1.opacity-70")
      expect(timestamp).toBeInTheDocument()
      expect(timestamp?.textContent).toBeTruthy()
      expect(timestamp?.textContent?.length).toBeGreaterThan(0)
    })

    it("should display formatted timestamp for assistant message", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content="Test"
          timestamp={new Date("2024-01-01T14:45:00Z")}
        />
      )

      // Check that timestamp element exists and has text content
      const timestamp = container.querySelector(".text-xs.mt-1.opacity-70")
      expect(timestamp).toBeInTheDocument()
      expect(timestamp?.textContent).toBeTruthy()
      expect(timestamp?.textContent?.length).toBeGreaterThan(0)
    })

    it("should handle midnight timestamp", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Test"
          timestamp={new Date("2024-01-01T00:00:00Z")}
        />
      )

      // Check that timestamp element exists
      const timestamp = container.querySelector(".text-xs.mt-1.opacity-70")
      expect(timestamp).toBeInTheDocument()
      expect(timestamp?.textContent).toBeTruthy()
    })

    it("should handle noon timestamp", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content="Test"
          timestamp={new Date("2024-01-01T12:00:00Z")}
        />
      )

      // Check that timestamp element exists
      const timestamp = container.querySelector(".text-xs.mt-1.opacity-70")
      expect(timestamp).toBeInTheDocument()
      expect(timestamp?.textContent).toBeTruthy()
    })

    it("should apply small text and opacity to timestamp", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Test"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const timestamp = container.querySelector(".text-xs.mt-1.opacity-70")
      expect(timestamp).toBeInTheDocument()
    })

    it("should apply white color to user timestamp", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Test"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const timestamp = container.querySelector(".text-white")
      expect(timestamp).toBeInTheDocument()
    })

    it("should apply gray color to assistant timestamp", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content="Test"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const timestamp = container.querySelector(".text-gray-500")
      expect(timestamp).toBeInTheDocument()
    })
  })

  describe("Message Bubble Styling", () => {
    it("should apply max-w-70% to message bubble", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Test message"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const messageBubble = container.querySelector(".max-w-\\[70\\%\\]")
      expect(messageBubble).toBeInTheDocument()
    })

    it("should apply padding to message bubble", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Test"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const messageBubble = container.querySelector(".px-4.py-2")
      expect(messageBubble).toBeInTheDocument()
    })

    it("should apply rounded-2xl to message bubble", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Test"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const messageBubble = container.querySelector(".rounded-2xl")
      expect(messageBubble).toBeInTheDocument()
    })
  })

  describe("Layout and Spacing", () => {
    it("should render message with flex layout", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Test"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const messageRow = container.querySelector(".flex.gap-3")
      expect(messageRow).toBeInTheDocument()
    })

    it("should add margin bottom to message", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Test"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const messageRow = container.querySelector(".mb-4")
      expect(messageRow).toBeInTheDocument()
    })

    it("should add gap between avatar and message bubble", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Test"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const messageRow = container.querySelector(".gap-3")
      expect(messageRow).toBeInTheDocument()
    })
  })

  describe("Edge Cases", () => {
    it("should handle message with only bold text", () => {
      render(
        <ChatMessage
          role="user"
          content="**all bold**"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      expect(screen.getByText("all bold")).toBeInTheDocument()
    })

    it("should handle message with multiple consecutive line breaks", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content={`Line 1


Line 4`}
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      const messageContent = container.querySelector(".text-sm.leading-relaxed")
      expect(messageContent?.innerHTML).toMatch(/<br\s*\/?>/)
    })

    it("should handle message with emoji", () => {
      render(
        <ChatMessage
          role="user"
          content="Hello! 👋 How are you? 😊"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      expect(screen.getByText(/Hello!/)).toBeInTheDocument()
      expect(screen.getByText(/How are you/)).toBeInTheDocument()
    })

    it("should handle very short message", () => {
      render(
        <ChatMessage
          role="assistant"
          content="Hi!"
          timestamp={new Date("2024-01-01T10:00:00Z")}
        />
      )

      expect(screen.getByText("Hi!")).toBeInTheDocument()
    })

    it("should handle message without timestamp", () => {
      render(
        <ChatMessage
          role="user"
          content="No timestamp"
        />
      )

      expect(screen.getByText("No timestamp")).toBeInTheDocument()
      expect(screen.queryByText("AM")).not.toBeInTheDocument()
      expect(screen.queryByText("PM")).not.toBeInTheDocument()
    })
  })

  describe("Full Integration", () => {
    it("should render complete user message with all elements", () => {
      const { container } = render(
        <ChatMessage
          role="user"
          content="Hello **world**!"
          timestamp={new Date("2024-01-01T09:30:00Z")}
        />
      )

      // Check container
      expect(container.querySelector(".flex-row-reverse")).toBeInTheDocument()

      // Check avatar
      expect(container.querySelector(".bg-primary-600.text-white.rounded-full")).toBeInTheDocument()

      // Check message bubble
      expect(container.querySelector(".bg-primary-600")).toBeInTheDocument()

      // Check bold content
      const boldElement = container.querySelector("strong")
      expect(boldElement?.textContent).toBe("world")

      // Check timestamp exists
      const timestamp = container.querySelector(".text-xs.mt-1.opacity-70")
      expect(timestamp).toBeInTheDocument()
      expect(timestamp?.textContent).toBeTruthy()
    })

    it("should render complete assistant message with all elements", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content="Here's your **answer**"
          timestamp={new Date("2024-01-01T15:45:00Z")}
        />
      )

      // Check container
      expect(container.querySelector(".flex-row:not(.flex-row-reverse)")).toBeInTheDocument()

      // Check avatar
      expect(container.querySelector(".bg-gray-200")).toBeInTheDocument()

      // Check message bubble
      expect(container.querySelector(".bg-gray-100")).toBeInTheDocument()

      // Check bold content
      const boldElement = container.querySelector("strong")
      expect(boldElement?.textContent).toBe("answer")

      // Check timestamp exists
      const timestamp = container.querySelector(".text-xs.mt-1.opacity-70")
      expect(timestamp).toBeInTheDocument()
      expect(timestamp?.textContent).toBeTruthy()
    })

    it("should render loading state for assistant message", () => {
      const { container } = render(
        <ChatMessage
          role="assistant"
          content=""
          timestamp={new Date("2024-01-01T10:00:00Z")}
          isLoading
        />
      )

      // Check container
      expect(container.querySelector(".flex-row")).toBeInTheDocument()

      // Check avatar
      expect(container.querySelector(".bg-gray-200")).toBeInTheDocument()

      // Check loading indicator
      const loadingContainer = container.querySelector(".flex.gap-1.items-center")
      expect(loadingContainer).toBeInTheDocument()

      const dots = container.querySelectorAll(".w-2.h-2.bg-gray-400.rounded-full.animate-bounce")
      expect(dots).toHaveLength(3)
    })
  })
})
