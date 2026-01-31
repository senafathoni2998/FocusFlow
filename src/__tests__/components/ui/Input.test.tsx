/**
 * Unit tests for src/components/ui/Input.tsx
 *
 * Tests cover:
 * - Input rendering
 * - Label rendering and association
 * - Error message display
 * - Custom className
 * - HTML attributes pass-through
 * - Ref forwarding
 * - Auto-generated id from label
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import Input from "@/components/ui/Input"

describe("Input Component", () => {
  describe("Rendering", () => {
    it("should render input element", () => {
      const { container } = render(<Input />)
      expect(container.querySelector("input")).toBeInTheDocument()
    })

    it("should render with placeholder", () => {
      render(<Input placeholder="Enter text" />)
      expect(screen.getByPlaceholderText("Enter text")).toBeInTheDocument()
    })

    it("should render with value", () => {
      render(<Input value="test value" />)
      const input = screen.getByRole("textbox")
      expect(input).toHaveValue("test value")
    })
  })

  describe("Label", () => {
    it("should render label when provided", () => {
      render(<Input label="Username" />)
      expect(screen.getByText("Username")).toBeInTheDocument()
    })

    it("should not render label when not provided", () => {
      const { container } = render(<Input />)
      expect(container.querySelector("label")).not.toBeInTheDocument()
    })

    it("should associate label with input via htmlFor", () => {
      render(<Input label="Email" id="email-input" />)
      const input = screen.getByRole("textbox")
      const label = screen.getByText("Email")

      expect(label).toHaveAttribute("for", "email-input")
      expect(input).toHaveAttribute("id", "email-input")
    })

    it("should auto-generate id from label when id not provided", () => {
      render(<Input label="User Name" />)
      const input = screen.getByRole("textbox")
      const label = screen.getByText("User Name")

      expect(input).toHaveAttribute("id", "user-name")
      expect(label).toHaveAttribute("for", "user-name")
    })

    it("should handle multi-word labels in id generation", () => {
      render(<Input label="Enter your email address" />)
      const input = screen.getByRole("textbox")
      expect(input).toHaveAttribute("id", "enter-your-email-address")
    })

    it("should use provided id over auto-generated one", () => {
      render(<Input label="Name" id="custom-id" />)
      const input = screen.getByRole("textbox")
      expect(input).toHaveAttribute("id", "custom-id")
    })
  })

  describe("Error State", () => {
    it("should not show error when not provided", () => {
      const { container } = render(<Input />)
      expect(container.querySelector("p")).not.toBeInTheDocument()
    })

    it("should show error message when provided", () => {
      render(<Input error="This field is required" />)
      expect(screen.getByText("This field is required")).toBeInTheDocument()
    })

    it("should apply danger border when error is present", () => {
      const { container } = render(<Input error="Error" />)
      const input = container.querySelector("input")
      expect(input).toHaveClass("border-danger-300")
    })

    it("should apply gray border when no error", () => {
      const { container } = render(<Input />)
      const input = container.querySelector("input")
      expect(input).toHaveClass("border-gray-300")
    })

    it("should not have danger class when error is removed", () => {
      const { container, rerender } = render(<Input error="Error" />)
      let input = container.querySelector("input")
      expect(input).toHaveClass("border-danger-300")

      rerender(<Input />)
      input = container.querySelector("input")
      expect(input).toHaveClass("border-gray-300")
    })
  })

  describe("Styling", () => {
    it("should include base input classes", () => {
      const { container } = render(<Input />)
      const input = container.querySelector("input")
      expect(input).toHaveClass("w-full")
      expect(input).toHaveClass("px-4")
      expect(input).toHaveClass("py-2")
      expect(input).toHaveClass("border")
      expect(input).toHaveClass("rounded-lg")
    })

    it("should include focus classes", () => {
      const { container } = render(<Input />)
      const input = container.querySelector("input")
      expect(input).toHaveClass("focus:ring-2")
      expect(input).toHaveClass("focus:ring-primary-500")
      expect(input).toHaveClass("focus:border-transparent")
      expect(input).toHaveClass("outline-none")
    })

    it("should apply custom className", () => {
      const { container } = render(<Input className="bg-gray-50" />)
      const input = container.querySelector("input")
      expect(input).toHaveClass("bg-gray-50")
    })

    it("should merge custom classes with base classes", () => {
      const { container } = render(<Input className="pl-10" />)
      const input = container.querySelector("input")
      expect(input).toHaveClass("w-full")
      expect(input).toHaveClass("pl-10")
    })
  })

  describe("Label Styling", () => {
    it("should apply default label styles", () => {
      const { container } = render(<Input label="Test Label" />)
      const label = container.querySelector("label")
      expect(label).toHaveClass("block")
      expect(label).toHaveClass("text-sm")
      expect(label).toHaveClass("font-medium")
      expect(label).toHaveClass("text-gray-700")
      expect(label).toHaveClass("mb-2")
    })
  })

  describe("Error Message Styling", () => {
    it("should apply error message styles", () => {
      const { container } = render(<Input error="Error message" />)
      const error = container.querySelector("p")
      expect(error).toHaveClass("mt-1")
      expect(error).toHaveClass("text-sm")
      expect(error).toHaveClass("text-danger-600")
    })
  })

  describe("Interactions", () => {
    it("should allow typing in the input", async () => {
      const user = userEvent.setup()
      render(<Input />)

      const input = screen.getByRole("textbox")
      await user.type(input, "Hello World")

      expect(input).toHaveValue("Hello World")
    })

    it("should call onChange handler", async () => {
      const handleChange = jest.fn()
      const user = userEvent.setup()

      render(<Input onChange={handleChange} />)
      const input = screen.getByRole("textbox")

      await user.type(input, "test")

      expect(handleChange).toHaveBeenCalled()
    })

    it("should be focusable", async () => {
      const user = userEvent.setup()
      render(<Input />)

      const input = screen.getByRole("textbox")
      await user.click(input)

      expect(input).toHaveFocus()
    })
  })

  describe("Disabled State", () => {
    it("should apply disabled styles", () => {
      const { container } = render(<Input disabled />)
      const input = container.querySelector("input")
      expect(input).toHaveClass("disabled:opacity-50")
      expect(input).toHaveClass("disabled:cursor-not-allowed")
    })

    it("should be disabled when disabled prop is true", () => {
      render(<Input disabled />)
      const input = screen.getByRole("textbox")
      expect(input).toBeDisabled()
    })

    it("should not allow typing when disabled", async () => {
      const user = userEvent.setup()
      render(<Input disabled value="initial" />)

      const input = screen.getByRole("textbox")
      await user.type(input, "test")

      expect(input).toHaveValue("initial")
    })
  })

  describe("HTML Attributes", () => {
    it("should pass through name attribute", () => {
      render(<Input name="username" />)
      const input = screen.getByRole("textbox")
      expect(input).toHaveAttribute("name", "username")
    })

    it("should pass through type attribute", () => {
      const { container } = render(<Input type="email" />)
      const input = container.querySelector("input")
      expect(input).toHaveAttribute("type", "email")
    })

    it("should support different input types", () => {
      const { container: container1 } = render(<Input type="password" />)
      const { container: container2 } = render(<Input type="number" />)
      const { container: container3 } = render(<Input type="email" />)

      expect(container1.querySelector("input")).toHaveAttribute("type", "password")
      expect(container2.querySelector("input")).toHaveAttribute("type", "number")
      expect(container3.querySelector("input")).toHaveAttribute("type", "email")
    })

    it("should pass through required attribute", () => {
      render(<Input required />)
      const input = screen.getByRole("textbox")
      expect(input).toBeRequired()
    })

    it("should pass through min and max attributes", () => {
      render(<Input type="number" min={0} max={100} />)
      const input = screen.getByRole("spinbutton")
      expect(input).toHaveAttribute("min", "0")
      expect(input).toHaveAttribute("max", "100")
    })
  })

  describe("Ref Forwarding", () => {
    it("should forward ref to input element", () => {
      const ref = { current: null as HTMLInputElement | null }
      render(<Input ref={ref} />)

      expect(ref.current).toBeInstanceOf(HTMLInputElement)
      expect(ref.current?.tagName).toBe("INPUT")
    })

    it("should allow focus via ref", () => {
      const ref = { current: null as HTMLInputElement | null }
      render(<Input ref={ref} />)

      ref.current?.focus()
      expect(ref.current).toHaveFocus()
    })
  })

  describe("Display Name", () => {
    it("should have displayName set", () => {
      expect(Input.displayName).toBe("Input")
    })
  })

  describe("Wrapper", () => {
    it("should wrap input in a div", () => {
      const { container } = render(<Input />)
      const wrapper = container.firstChild as HTMLElement
      expect(wrapper.tagName).toBe("DIV")
      expect(wrapper).toHaveClass("w-full")
    })

    it("should contain label, input, and error in wrapper", () => {
      const { container } = render(<Input label="Test" error="Error" />)
      const wrapper = container.firstChild as HTMLElement

      expect(wrapper.querySelector("label")).toBeInTheDocument()
      expect(wrapper.querySelector("input")).toBeInTheDocument()
      expect(wrapper.querySelector("p")).toBeInTheDocument()
    })
  })

  describe("Combinations", () => {
    it("should render input with label and custom className", () => {
      const { container } = render(<Input label="Full Name" className="bg-gray-100" />)
      const label = container.querySelector("label")
      const input = container.querySelector("input")

      expect(label).toHaveTextContent("Full Name")
      expect(input).toHaveClass("bg-gray-100")
    })

    it("should render input with label and error", () => {
      const { container } = render(<Input label="Email" error="Invalid email" />)
      const label = container.querySelector("label")
      const input = container.querySelector("input")
      const error = container.querySelector("p")

      expect(label).toHaveTextContent("Email")
      expect(input).toHaveClass("border-danger-300")
      expect(error).toHaveTextContent("Invalid email")
    })

    it("should render all props together", () => {
      const { container } = render(
        <Input
          label="Password"
          id="password-input"
          type="password"
          placeholder="Enter password"
          error="Password is required"
          required
          className="bg-gray-50"
        />
      )

      const label = container.querySelector("label")
      const input = container.querySelector("input")
      const error = container.querySelector("p")

      expect(label).toHaveAttribute("for", "password-input")
      expect(input).toHaveAttribute("type", "password")
      expect(input).toHaveAttribute("placeholder", "Enter password")
      expect(input).toBeRequired()
      expect(error).toHaveTextContent("Password is required")
    })
  })
})
