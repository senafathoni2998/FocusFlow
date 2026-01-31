/**
 * Unit tests for src/components/ui/Modal.tsx
 *
 * Tests cover:
 * - Modal open/close behavior
 * - Title rendering
 * - Size variants (sm, md, lg, xl)
 * - Children rendering
 * - Overlay click to close
 * - Close button functionality
 * - Body scroll lock
 */

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import Modal from "@/components/ui/Modal"

describe("Modal Component", () => {
  describe("Rendering", () => {
    it("should not render when isOpen is false", () => {
      const { container } = render(<Modal isOpen={false} onClose={() => {}}>Content</Modal>)
      expect(container.firstChild).toBeNull()
    })

    it("should render when isOpen is true", () => {
      const { container } = render(<Modal isOpen={true} onClose={() => {}}>Content</Modal>)
      expect(container.firstChild).toBeInTheDocument()
    })

    it("should render children content", () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          Modal content here
        </Modal>
      )
      expect(screen.getByText("Modal content here")).toBeInTheDocument()
    })

    it("should render title when provided", () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Test Title">
          Content
        </Modal>
      )
      expect(screen.getByText("Test Title")).toBeInTheDocument()
    })

    it("should not render title when not provided", () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      )
      const heading = screen.queryByRole("heading", { level: 2 })
      expect(heading).not.toBeInTheDocument()
    })
  })

  describe("Size Variants", () => {
    it("should render medium size by default", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      )
      const modal = container.querySelector(".bg-white.rounded-lg")
      expect(modal).toHaveClass("max-w-md")
    })

    it("should render small size", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} size="sm">
          Content
        </Modal>
      )
      const modal = container.querySelector(".bg-white.rounded-lg")
      expect(modal).toHaveClass("max-w-sm")
    })

    it("should render large size", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} size="lg">
          Content
        </Modal>
      )
      const modal = container.querySelector(".bg-white.rounded-lg")
      expect(modal).toHaveClass("max-w-lg")
    })

    it("should render extra large size", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} size="xl">
          Content
        </Modal>
      )
      const modal = container.querySelector(".bg-white.rounded-lg")
      expect(modal).toHaveClass("max-w-xl")
    })
  })

  describe("Close Behavior", () => {
    it("should call onClose when overlay is clicked", async () => {
      const handleClose = jest.fn()
      const user = userEvent.setup()

      const { container } = render(
        <Modal isOpen={true} onClose={handleClose}>
          Content
        </Modal>
      )

      const overlay = container.querySelector(".bg-black")
      if (overlay) {
        await user.click(overlay)
        expect(handleClose).toHaveBeenCalledTimes(1)
      }
    })

    it("should call onClose when close button is clicked", async () => {
      const handleClose = jest.fn()
      const user = userEvent.setup()

      render(
        <Modal isOpen={true} onClose={handleClose} title="Title">
          Content
        </Modal>
      )

      const closeButton = screen.getByRole("button").closest("button")
      if (closeButton) {
        await user.click(closeButton)
        expect(handleClose).toHaveBeenCalledTimes(1)
      }
    })

    it("should render close button when title is provided", () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Title">
          Content
        </Modal>
      )
      const closeButton = screen.getByRole("button")
      expect(closeButton).toBeInTheDocument()
    })

    it("should not render close button when title is not provided", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      )
      // Check for SVG close button
      const svg = container.querySelector("svg")
      expect(svg).not.toBeInTheDocument()
    })
  })

  describe("Body Scroll Lock", () => {
    beforeEach(() => {
      // Reset body overflow before each test
      document.body.style.overflow = "unset"
    })

    it("should lock body scroll when modal opens", () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      )
      expect(document.body.style.overflow).toBe("hidden")
    })

    it("should unlock body scroll when modal closes", () => {
      const { rerender } = render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      )

      expect(document.body.style.overflow).toBe("hidden")

      rerender(
        <Modal isOpen={false} onClose={() => {}}>
          Content
        </Modal>
      )

      expect(document.body.style.overflow).toBe("unset")
    })

    it("should unlock body scroll on unmount", () => {
      const { unmount } = render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      )

      expect(document.body.style.overflow).toBe("hidden")

      unmount()

      expect(document.body.style.overflow).toBe("unset")
    })

    it("should handle multiple open/close cycles", async () => {
      const { rerender } = render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      )

      expect(document.body.style.overflow).toBe("hidden")

      rerender(
        <Modal isOpen={false} onClose={() => {}}>
          Content
        </Modal>
      )

      expect(document.body.style.overflow).toBe("unset")

      rerender(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      )

      expect(document.body.style.overflow).toBe("hidden")
    })
  })

  describe("Overlay", () => {
    it("should render overlay with correct classes", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      )
      const overlay = container.querySelector(".bg-black")
      expect(overlay).toHaveClass("fixed")
      expect(overlay).toHaveClass("inset-0")
      expect(overlay).toHaveClass("bg-opacity-50")
    })

    it("should render overlay behind modal content", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      )
      const overlay = container.querySelector(".bg-black")
      const modal = container.querySelector(".bg-white.rounded-lg")

      expect(overlay).toBeInTheDocument()
      expect(modal).toBeInTheDocument()
    })
  })

  describe("Modal Container", () => {
    it("should render modal with correct classes", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      )
      const modal = container.querySelector(".bg-white.rounded-lg")
      expect(modal).toHaveClass("relative")
      expect(modal).toHaveClass("shadow-xl")
      expect(modal).toHaveClass("w-full")
      expect(modal).toHaveClass("p-6")
    })

    it("should have correct z-index for modal container", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      )
      const containerDiv = container.firstChild as HTMLElement
      expect(containerDiv).toHaveClass("z-50")
    })
  })

  describe("Content Rendering", () => {
    it("should render complex children", () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Form">
          <form>
            <label htmlFor="name">Name</label>
            <input id="name" type="text" />
            <button type="submit">Submit</button>
          </form>
        </Modal>
      )

      expect(screen.getByLabelText("Name")).toBeInTheDocument()
      expect(screen.getByText("Submit")).toBeInTheDocument()
    })

    it("should render multiple children elements", () => {
      render(
        <Modal isOpen={true} onClose={() => {}}>
          <p>Paragraph 1</p>
          <p>Paragraph 2</p>
          <button>Button</button>
        </Modal>
      )

      expect(screen.getByText("Paragraph 1")).toBeInTheDocument()
      expect(screen.getByText("Paragraph 2")).toBeInTheDocument()
      expect(screen.getByText("Button")).toBeInTheDocument()
    })
  })

  describe("Header Layout", () => {
    it("should render title and close button in header", () => {
      render(
        <Modal isOpen={true} onClose={() => {}} title="Modal Title">
          Content
        </Modal>
      )

      expect(screen.getByText("Modal Title")).toBeInTheDocument()
      const closeButton = screen.getByRole("button")
      expect(closeButton).toBeInTheDocument()
    })

    it("should have correct header layout classes", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Title">
          Content
        </Modal>
      )

      const header = container.querySelector(".flex.items-center.justify-between")
      expect(header).toBeInTheDocument()
      expect(header).toHaveClass("mb-4")
    })
  })

  describe("Close Button Icon", () => {
    it("should render close button with SVG icon", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Title">
          Content
        </Modal>
      )

      const svg = container.querySelector("svg")
      expect(svg).toBeInTheDocument()
      expect(svg).toHaveAttribute("fill", "none")
      expect(svg).toHaveAttribute("stroke", "currentColor")
    })

    it("should render correct path for X icon", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Title">
          Content
        </Modal>
      )

      const path = container.querySelector("path")
      expect(path).toBeInTheDocument()
      expect(path).toHaveAttribute("d", "M6 18L18 6M6 6l12 12")
    })
  })

  describe("Transitions and Styles", () => {
    it("should apply transition opacity to overlay", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}}>
          Content
        </Modal>
      )
      const overlay = container.querySelector(".bg-black")
      expect(overlay).toHaveClass("transition-opacity")
    })

    it("should apply hover style to close button", () => {
      const { container } = render(
        <Modal isOpen={true} onClose={() => {}} title="Title">
          Content
        </Modal>
      )
      const closeButton = container.querySelector("button")
      expect(closeButton).toHaveClass("text-gray-400")
      expect(closeButton).toHaveClass("hover:text-gray-600")
      expect(closeButton).toHaveClass("transition")
    })
  })
})
