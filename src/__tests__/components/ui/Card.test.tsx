/**
 * Unit tests for src/components/ui/Card.tsx
 *
 * Tests cover:
 * - Card rendering with children
 * - All variants (default, outlined, elevated)
 * - Custom className
 * - HTML attributes pass-through
 * - Ref forwarding
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import Card from "@/components/ui/Card"

describe("Card Component", () => {
  describe("Rendering", () => {
    it("should render children", () => {
      render(<Card>Card content</Card>)
      expect(screen.getByText("Card content")).toBeInTheDocument()
    })

    it("should render div element", () => {
      const { container } = render(<Card>Content</Card>)
      expect(container.querySelector("div")).toBeInTheDocument()
    })

    it("should render nested elements", () => {
      render(
        <Card>
          <h2>Title</h2>
          <p>Description</p>
        </Card>
      )
      expect(screen.getByText("Title")).toBeInTheDocument()
      expect(screen.getByText("Description")).toBeInTheDocument()
    })
  })

  describe("Variants", () => {
    it("should render default variant by default", () => {
      const { container } = render(<Card>Default</Card>)
      const card = container.firstChild as HTMLElement
      expect(card).toHaveClass("bg-white")
      expect(card).toHaveClass("shadow-sm")
    })

    it("should render default variant explicitly", () => {
      const { container } = render(<Card variant="default">Default</Card>)
      const card = container.firstChild as HTMLElement
      expect(card).toHaveClass("bg-white")
      expect(card).toHaveClass("shadow-sm")
    })

    it("should render outlined variant", () => {
      const { container } = render(<Card variant="outlined">Outlined</Card>)
      const card = container.firstChild as HTMLElement
      expect(card).toHaveClass("bg-white")
      expect(card).toHaveClass("border")
      expect(card).toHaveClass("border-gray-200")
    })

    it("should render elevated variant", () => {
      const { container } = render(<Card variant="elevated">Elevated</Card>)
      const card = container.firstChild as HTMLElement
      expect(card).toHaveClass("bg-white")
      expect(card).toHaveClass("shadow-lg")
    })
  })

  describe("Base Styles", () => {
    it("should include base classes", () => {
      const { container } = render(<Card>Card</Card>)
      const card = container.firstChild as HTMLElement
      expect(card).toHaveClass("rounded-lg")
    })
  })

  describe("Custom Styling", () => {
    it("should apply custom className", () => {
      const { container } = render(<Card className="p-6 bg-blue-50">Custom</Card>)
      const card = container.firstChild as HTMLElement
      expect(card).toHaveClass("p-6")
      expect(card).toHaveClass("bg-blue-50")
    })

    it("should merge classes with variant classes", () => {
      const { container } = render(<Card variant="outlined" className="p-4">Merged</Card>)
      const card = container.firstChild as HTMLElement
      expect(card).toHaveClass("rounded-lg")
      expect(card).toHaveClass("border")
      expect(card).toHaveClass("p-4")
    })
  })

  describe("HTML Attributes", () => {
    it("should pass through id attribute", () => {
      const { container } = render(<Card id="test-card">Card</Card>)
      const card = container.firstChild as HTMLElement
      expect(card).toHaveAttribute("id", "test-card")
    })

    it("should pass through data attributes", () => {
      const { container } = render(<Card data-testid="custom-card">Card</Card>)
      const card = container.firstChild as HTMLElement
      expect(card).toHaveAttribute("data-testid", "custom-card")
    })

    it("should pass through aria attributes", () => {
      const { container } = render(<Card role="article" aria-label="Card content">Card</Card>)
      const card = container.firstChild as HTMLElement
      expect(card).toHaveAttribute("role", "article")
      expect(card).toHaveAttribute("aria-label", "Card content")
    })

    it("should pass through onClick handler", async () => {
      const handleClick = jest.fn()
      const user = userEvent.setup()

      const { container } = render(<Card onClick={handleClick}>Clickable</Card>)
      const card = container.firstChild as HTMLElement

      await user.click(card)
      expect(handleClick).toHaveBeenCalledTimes(1)
    })
  })

  describe("Ref Forwarding", () => {
    it("should forward ref to div element", () => {
      const ref = { current: null as HTMLDivElement | null }
      render(<Card ref={ref}>Ref Card</Card>)

      expect(ref.current).toBeInstanceOf(HTMLDivElement)
      expect(ref.current?.tagName).toBe("DIV")
    })
  })

  describe("Display Name", () => {
    it("should have displayName set", () => {
      expect(Card.displayName).toBe("Card")
    })
  })

  describe("Complex Content", () => {
    it("should render card with header and body", () => {
      render(
        <Card>
          <div className="p-4">
            <h3 className="font-bold">Header</h3>
            <p className="text-gray-600">Body content</p>
          </div>
        </Card>
      )
      expect(screen.getByText("Header")).toBeInTheDocument()
      expect(screen.getByText("Body content")).toBeInTheDocument()
    })

    it("should render card with multiple children", () => {
      render(
        <Card>
          <span>Item 1</span>
          <span>Item 2</span>
          <span>Item 3</span>
        </Card>
      )
      expect(screen.getByText("Item 1")).toBeInTheDocument()
      expect(screen.getByText("Item 2")).toBeInTheDocument()
      expect(screen.getByText("Item 3")).toBeInTheDocument()
    })
  })

  describe("Combinations", () => {
    it("should render outlined card with custom classes", () => {
      const { container } = render(<Card variant="outlined" className="p-6 hover:shadow-md">Combined</Card>)
      const card = container.firstChild as HTMLElement
      expect(card).toHaveClass("border")
      expect(card).toHaveClass("p-6")
      expect(card).toHaveClass("hover:shadow-md")
    })

    it("should render elevated card with id and data attributes", () => {
      const { container } = render(
        <Card variant="elevated" id="featured-card" data-priority="high">
          Featured
        </Card>
      )
      const card = container.firstChild as HTMLElement
      expect(card).toHaveClass("shadow-lg")
      expect(card).toHaveAttribute("id", "featured-card")
      expect(card).toHaveAttribute("data-priority", "high")
    })
  })
})
