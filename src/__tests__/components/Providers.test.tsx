/**
 * Unit tests for src/components/Providers.tsx
 *
 * Tests cover:
 * - Rendering children
 * - SessionProvider wrapping
 * - Multiple children rendering
 * - Children with various content types
 */

import { render, screen } from "@testing-library/react"

// Mock next-auth SessionProvider before importing the component
jest.mock("next-auth/react", () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="session-provider">{children}</div>
  ),
}))

import Providers from "@/components/Providers"

describe("Providers Component", () => {
  describe("Basic Rendering", () => {
    it("should render children correctly", () => {
      render(
        <Providers>
          <div>Test Child</div>
        </Providers>
      )

      expect(screen.getByText("Test Child")).toBeInTheDocument()
    })

    it("should render SessionProvider wrapper", () => {
      const { container } = render(
        <Providers>
          <div>Content</div>
        </Providers>
      )

      const sessionProvider = container.querySelector('[data-testid="session-provider"]')
      expect(sessionProvider).toBeInTheDocument()
    })

    it("should wrap children with SessionProvider", () => {
      const { container } = render(
        <Providers>
          <span>Wrapped Content</span>
        </Providers>
      )

      const sessionProvider = container.querySelector('[data-testid="session-provider"]')
      expect(sessionProvider?.innerHTML).toContain("Wrapped Content")
    })
  })

  describe("Multiple Children", () => {
    it("should render multiple children", () => {
      render(
        <Providers>
          <div>First Child</div>
          <div>Second Child</div>
          <div>Third Child</div>
        </Providers>
      )

      expect(screen.getByText("First Child")).toBeInTheDocument()
      expect(screen.getByText("Second Child")).toBeInTheDocument()
      expect(screen.getByText("Third Child")).toBeInTheDocument()
    })

    it("should render all children in correct order", () => {
      const { container } = render(
        <Providers>
          <div data-order="1">First</div>
          <div data-order="2">Second</div>
          <div data-order="3">Third</div>
        </Providers>
      )

      const children = container.querySelectorAll("[data-order]")
      expect(children[0]?.getAttribute("data-order")).toBe("1")
      expect(children[1]?.getAttribute("data-order")).toBe("2")
      expect(children[2]?.getAttribute("data-order")).toBe("3")
    })
  })

  describe("Nested Children", () => {
    it("should render nested children components", () => {
      const NestedComponent = () => <div>Nested Component Content</div>

      render(
        <Providers>
          <div>
            <NestedComponent />
          </div>
        </Providers>
      )

      expect(screen.getByText("Nested Component Content")).toBeInTheDocument()
    })

    it("should render deeply nested children", () => {
      render(
        <Providers>
          <div>
            <div>
              <div>
                <span>Deep Content</span>
              </div>
            </div>
          </div>
        </Providers>
      )

      expect(screen.getByText("Deep Content")).toBeInTheDocument()
    })
  })

  describe("Children Content Types", () => {
    it("should render text content", () => {
      render(<Providers>Plain Text Content</Providers>)

      expect(screen.getByText("Plain Text Content")).toBeInTheDocument()
    })

    it("should render null child gracefully", () => {
      const { container } = render(
        <Providers>
          <div>Before Null</div>
          {null}
          <div>After Null</div>
        </Providers>
      )

      expect(screen.getByText("Before Null")).toBeInTheDocument()
      expect(screen.getByText("After Null")).toBeInTheDocument()
    })

    it("should render undefined child gracefully", () => {
      const { container } = render(
        <Providers>
          <div>Before Undefined</div>
          {undefined}
          <div>After Undefined</div>
        </Providers>
      )

      expect(screen.getByText("Before Undefined")).toBeInTheDocument()
      expect(screen.getByText("After Undefined")).toBeInTheDocument()
    })

    it("should render boolean child gracefully", () => {
      const { container } = render(
        <Providers>
          <div>Before Boolean</div>
          {false}
          <div>After Boolean</div>
        </Providers>
      )

      expect(screen.getByText("Before Boolean")).toBeInTheDocument()
      expect(screen.getByText("After Boolean")).toBeInTheDocument()
    })

    it("should render number content", () => {
      render(<Providers>{42}</Providers>)

      expect(screen.getByText("42")).toBeInTheDocument()
    })

    it("should render fragment children", () => {
      render(
        <Providers>
          <>
            <div>Fragment Child 1</div>
            <div>Fragment Child 2</div>
          </>
        </Providers>
      )

      expect(screen.getByText("Fragment Child 1")).toBeInTheDocument()
      expect(screen.getByText("Fragment Child 2")).toBeInTheDocument()
    })
  })

  describe("Conditional Children", () => {
    it("should render conditional children", () => {
      const condition = true

      render(
        <Providers>
          <div>Always Visible</div>
          {condition && <div>Conditional Content</div>}
        </Providers>
      )

      expect(screen.getByText("Always Visible")).toBeInTheDocument()
      expect(screen.getByText("Conditional Content")).toBeInTheDocument()
    })

    it("should not render children when condition is false", () => {
      const condition = false

      render(
        <Providers>
          <div>Always Visible</div>
          {condition && <div>Should Not Render</div>}
        </Providers>
      )

      expect(screen.getByText("Always Visible")).toBeInTheDocument()
      expect(screen.queryByText("Should Not Render")).not.toBeInTheDocument()
    })

    it("should render ternary conditional children", () => {
      const isLoggedIn = true

      render(
        <Providers>
          {isLoggedIn ? <div>Welcome Back</div> : <div>Please Login</div>}
        </Providers>
      )

      expect(screen.getByText("Welcome Back")).toBeInTheDocument()
      expect(screen.queryByText("Please Login")).not.toBeInTheDocument()
    })

    it("should render mapped children", () => {
      const items = ["Apple", "Banana", "Cherry"]

      render(
        <Providers>
          <ul>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Providers>
      )

      expect(screen.getByText("Apple")).toBeInTheDocument()
      expect(screen.getByText("Banana")).toBeInTheDocument()
      expect(screen.getByText("Cherry")).toBeInTheDocument()
    })
  })

  describe("Complex Children", () => {
    it("should render children with props", () => {
      interface ChildProps {
        title: string
        description: string
      }

      const ChildComponent = ({ title, description }: ChildProps) => (
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      )

      render(
        <Providers>
          <ChildComponent title="Test Title" description="Test Description" />
        </Providers>
      )

      expect(screen.getByText("Test Title")).toBeInTheDocument()
      expect(screen.getByText("Test Description")).toBeInTheDocument()
    })

    it("should render children with event handlers", () => {
      const handleClick = jest.fn()

      const { container } = render(
        <Providers>
          <button onClick={handleClick}>Click Me</button>
        </Providers>
      )

      const button = container.querySelector("button")
      expect(button).toBeInTheDocument()
    })

    it("should render children with className", () => {
      const { container } = render(
        <Providers>
          <div className="custom-class text-red-500">Styled Content</div>
        </Providers>
      )

      const element = container.querySelector(".custom-class")
      expect(element).toBeInTheDocument()
    })
  })

  describe("Provider Structure", () => {
    it("should have SessionProvider as direct parent of children", () => {
      const { container } = render(
        <Providers>
          <div data-testid="test-child">Child Content</div>
        </Providers>
      )

      const sessionProvider = container.querySelector('[data-testid="session-provider"]')
      const child = sessionProvider?.querySelector('[data-testid="test-child"]')

      expect(child).toBeInTheDocument()
      expect(child?.textContent).toBe("Child Content")
    })

    it("should maintain single wrapper element", () => {
      const { container } = render(
        <Providers>
          <div>Content</div>
        </Providers>
      )

      const sessionProviders = container.querySelectorAll('[data-testid="session-provider"]')
      expect(sessionProviders).toHaveLength(1)
    })
  })

  describe("Edge Cases", () => {
    it("should render empty children", () => {
      const { container } = render(<Providers>{null}</Providers>)

      const sessionProvider = container.querySelector('[data-testid="session-provider"]')
      expect(sessionProvider).toBeInTheDocument()
      expect(sessionProvider?.innerHTML).toBe("")
    })

    it("should render children with whitespace", () => {
      render(
        <Providers>
          <div>Text with spaces</div>
        </Providers>
      )

      expect(screen.getByText("Text with spaces")).toBeInTheDocument()
    })

    it("should render children with special characters", () => {
      render(
        <Providers>
          <div>Special chars: @#$%^&*()</div>
        </Providers>
      )

      expect(screen.getByText(/Special chars:/)).toBeInTheDocument()
    })

    it("should render children with emojis", () => {
      render(
        <Providers>
          <div>Emojis: 🎯 📊 📋 ⏱️</div>
        </Providers>
      )

      expect(screen.getByText(/Emojis:/)).toBeInTheDocument()
    })
  })

  describe("Integration Scenarios", () => {
    it("should render complex app structure", () => {
      const Header = () => <header>Header</header>
      const Main = () => <main>Main Content</main>
      const Footer = () => <footer>Footer</footer>

      render(
        <Providers>
          <Header />
          <Main />
          <Footer />
        </Providers>
      )

      expect(screen.getByText("Header")).toBeInTheDocument()
      expect(screen.getByText("Main Content")).toBeInTheDocument()
      expect(screen.getByText("Footer")).toBeInTheDocument()
    })

    it("should render layout component pattern", () => {
      const Layout = ({ children }: { children: React.ReactNode }) => (
        <div className="layout">
          <nav>Navigation</nav>
          <main>{children}</main>
          <footer>Footer</footer>
        </div>
      )

      render(
        <Providers>
          <Layout>
            <div>Page Content</div>
          </Layout>
        </Providers>
      )

      expect(screen.getByText("Navigation")).toBeInTheDocument()
      expect(screen.getByText("Page Content")).toBeInTheDocument()
      expect(screen.getByText("Footer")).toBeInTheDocument()
    })
  })
})
