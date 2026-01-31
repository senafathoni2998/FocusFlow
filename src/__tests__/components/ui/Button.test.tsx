/**
 * Unit tests for src/components/ui/Button.tsx
 *
 * Tests cover:
 * - Button rendering with children
 * - All variants (primary, secondary, danger, success)
 * - All sizes (sm, md, lg)
 * - Custom className
 * - Disabled state
 * - Click events
 * - Ref forwarding
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import Button from "@/components/ui/Button"

describe("Button Component", () => {
  describe("Rendering", () => {
    it("should render children text", () => {
      render(<Button>Click me</Button>)
      expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument()
    })

    it("should render with custom className", () => {
      const { container } = render(<Button className="custom-class">Click</Button>)
      const button = container.querySelector("button")
      expect(button).toHaveClass("custom-class")
    })

    it("should render button element by default", () => {
      const { container } = render(<Button>Click</Button>)
      expect(container.querySelector("button")).toBeInTheDocument()
    })
  })

  describe("Variants", () => {
    it("should render primary variant by default", () => {
      const { container } = render(<Button>Primary</Button>)
      const button = container.querySelector("button")
      expect(button).toHaveClass("bg-primary-600")
      expect(button).toHaveClass("text-white")
    })

    it("should render secondary variant", () => {
      const { container } = render(<Button variant="secondary">Secondary</Button>)
      const button = container.querySelector("button")
      expect(button).toHaveClass("bg-gray-200")
      expect(button).toHaveClass("text-gray-800")
    })

    it("should render danger variant", () => {
      const { container } = render(<Button variant="danger">Danger</Button>)
      const button = container.querySelector("button")
      expect(button).toHaveClass("bg-danger-600")
      expect(button).toHaveClass("text-white")
    })

    it("should render success variant", () => {
      const { container } = render(<Button variant="success">Success</Button>)
      const button = container.querySelector("button")
      expect(button).toHaveClass("bg-success-600")
      expect(button).toHaveClass("text-white")
    })
  })

  describe("Sizes", () => {
    it("should render medium size by default", () => {
      const { container } = render(<Button>Default</Button>)
      const button = container.querySelector("button")
      expect(button).toHaveClass("px-4")
      expect(button).toHaveClass("py-2")
    })

    it("should render small size", () => {
      const { container } = render(<Button size="sm">Small</Button>)
      const button = container.querySelector("button")
      expect(button).toHaveClass("px-3")
      expect(button).toHaveClass("py-1.5")
      expect(button).toHaveClass("text-sm")
    })

    it("should render large size", () => {
      const { container } = render(<Button size="lg">Large</Button>)
      const button = container.querySelector("button")
      expect(button).toHaveClass("px-6")
      expect(button).toHaveClass("py-3")
      expect(button).toHaveClass("text-lg")
    })
  })

  describe("Base Styles", () => {
    it("should include base classes", () => {
      const { container } = render(<Button>Button</Button>)
      const button = container.querySelector("button")
      expect(button).toHaveClass("rounded-lg")
      expect(button).toHaveClass("font-medium")
      expect(button).toHaveClass("transition-colors")
    })
  })

  describe("Interactions", () => {
    it("should call onClick handler when clicked", async () => {
      const handleClick = jest.fn()
      const user = userEvent.setup()

      render(<Button onClick={handleClick}>Click me</Button>)

      await user.click(screen.getByRole("button"))
      expect(handleClick).toHaveBeenCalledTimes(1)
    })

    it("should not call onClick when disabled", async () => {
      const handleClick = jest.fn()
      const user = userEvent.setup()

      render(<Button onClick={handleClick} disabled>Disabled</Button>)

      await user.click(screen.getByRole("button"))
      expect(handleClick).not.toHaveBeenCalled()
    })
  })

  describe("Disabled State", () => {
    it("should apply disabled styles when disabled", () => {
      const { container } = render(<Button disabled>Disabled</Button>)
      const button = container.querySelector("button")
      expect(button).toHaveClass("disabled:opacity-50")
      expect(button).toHaveClass("disabled:cursor-not-allowed")
    })

    it("should have disabled attribute when disabled prop is true", () => {
      render(<Button disabled>Disabled</Button>)
      expect(screen.getByRole("button")).toBeDisabled()
    })
  })

  describe("Focus Styles", () => {
    it("should include focus ring classes", () => {
      const { container } = render(<Button>Focus</Button>)
      const button = container.querySelector("button")
      expect(button).toHaveClass("focus:outline-none")
      expect(button).toHaveClass("focus:ring-2")
      expect(button).toHaveClass("focus:ring-offset-2")
    })

    it("should have variant-specific focus ring", () => {
      const { container } = render(<Button variant="primary">Primary</Button>)
      const button = container.querySelector("button")
      expect(button).toHaveClass("focus:ring-primary-500")
    })
  })

  describe("HTML Attributes", () => {
    it("should pass through other HTML attributes", () => {
      render(<Button data-testid="custom-button" type="submit" aria-label="Submit form">Submit</Button>)
      const button = screen.getByRole("button")
      expect(button).toHaveAttribute("data-testid", "custom-button")
      expect(button).toHaveAttribute("type", "submit")
      expect(button).toHaveAttribute("aria-label", "Submit form")
    })

    it("should support type attribute", () => {
      const { container } = render(<Button type="submit">Submit</Button>)
      const button = container.querySelector("button")
      expect(button).toHaveAttribute("type", "submit")
    })

    it("should support type='button'", () => {
      const { container } = render(<Button type="button">Button</Button>)
      const button = container.querySelector("button")
      expect(button).toHaveAttribute("type", "button")
    })
  })

  describe("Ref Forwarding", () => {
    it("should forward ref to button element", () => {
      const ref = { current: null as HTMLButtonElement | null }
      render(<Button ref={ref}>Ref Button</Button>)

      expect(ref.current).toBeInstanceOf(HTMLButtonElement)
      expect(ref.current?.tagName).toBe("BUTTON")
    })
  })

  describe("Display Name", () => {
    it("should have displayName set", () => {
      expect(Button.displayName).toBe("Button")
    })
  })

  describe("Combinations", () => {
    it("should render small secondary button", () => {
      const { container } = render(<Button variant="secondary" size="sm">Small Secondary</Button>)
      const button = container.querySelector("button")
      expect(button).toHaveClass("bg-gray-200")
      expect(button).toHaveClass("px-3")
      expect(button).toHaveClass("text-sm")
    })

    it("should render large danger button", () => {
      const { container } = render(<Button variant="danger" size="lg">Large Danger</Button>)
      const button = container.querySelector("button")
      expect(button).toHaveClass("bg-danger-600")
      expect(button).toHaveClass("px-6")
      expect(button).toHaveClass("text-lg")
    })

    it("should render all props together", () => {
      const { container } = render(
        <Button variant="success" size="md" className="mt-4" disabled>
          Custom Button
        </Button>
      )
      const button = container.querySelector("button")
      expect(button).toHaveClass("bg-success-600")
      expect(button).toHaveClass("px-4")
      expect(button).toHaveClass("mt-4")
      expect(button).toBeDisabled()
    })
  })
})
