/**
 * Unit tests for src/components/dashboard/Charts.tsx
 *
 * Tests cover:
 * - Chart rendering (Line, Bar, Pie)
 * - Data transformation and sorting
 * - Empty data handling
 * - Color constants
 * - Responsive containers
 * - Tooltip and Legend components
 */

import { render, screen } from "@testing-library/react"
import Charts from "@/components/dashboard/Charts"

// Mock recharts components
jest.mock("recharts", () => ({
  LineChart: ({ children, data }: any) => (
    <div data-testid="line-chart" data-data={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Line: ({ dataKey, stroke }: any) => (
    <div data-testid="line" data-datakey={dataKey} data-stroke={stroke} />
  ),
  BarChart: ({ children, data }: any) => (
    <div data-testid="bar-chart" data-data={JSON.stringify(data)}>
      {children}
    </div>
  ),
  Bar: ({ dataKey, fill }: any) => (
    <div data-testid="bar" data-datakey={dataKey} data-fill={fill} />
  ),
  PieChart: ({ children }: any) => (
    <div data-testid="pie-chart">{children}</div>
  ),
  Pie: ({ data, dataKey }: any) => (
    <div data-testid="pie" data-data={JSON.stringify(data)} data-datakey={dataKey} />
  ),
  Cell: ({ fill, key }: any) => (
    <div data-testid={`cell-${key}`} data-fill={fill} />
  ),
  XAxis: ({ dataKey }: any) => (
    <div data-testid="x-axis" data-datakey={dataKey} />
  ),
  YAxis: ({ label }: any) => (
    <div data-testid="y-axis" data-label={JSON.stringify(label)} />
  ),
  CartesianGrid: ({ strokeDasharray }: any) => (
    <div data-testid="cartesian-grid" data-strokedasharray={strokeDasharray} />
  ),
  Tooltip: ({ contentStyle, formatter }: any) => (
    <div data-testid="tooltip" data-formatter={String(formatter)} />
  ),
  Legend: () => <div data-testid="legend" />,
  ResponsiveContainer: ({ children, width, height }: any) => (
    <div data-testid="responsive-container" style={{ width, height }}>
      {children}
    </div>
  ),
}))

const mockDailyData = [
  { date: "2024-01-01", minutes: 120, sessions: 3 },
  { date: "2024-01-02", minutes: 90, sessions: 2 },
  { date: "2024-01-03", minutes: 150, sessions: 4 },
]

const mockTaskStats = {
  total: 10,
  todo: 3,
  inProgress: 4,
  completed: 3,
  highPriority: 2,
  mediumPriority: 5,
  lowPriority: 3,
}

const mockSessionStats = {
  total: 9,
  completed: 7,
  cancelled: 2,
  totalMinutes: 360,
}

describe("Charts Component", () => {
  describe("Initial Rendering", () => {
    it("should render charts container", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)
      const container = document.querySelector(".space-y-6")
      expect(container).toBeInTheDocument()
    })

    it("should render focus time chart section", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)
      expect(screen.getByText("Focus Time Over Period")).toBeInTheDocument()
    })

    it("should render sessions per day chart section", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)
      expect(screen.getByText("Sessions Per Day")).toBeInTheDocument()
    })

    it("should render task status pie chart", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)
      expect(screen.getByText("Task Status")).toBeInTheDocument()
    })

    it("should render task priority pie chart", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)
      expect(screen.getByText("Task Priority")).toBeInTheDocument()
    })

    it("should render all chart containers with white background", () => {
      const { container } = render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)
      const cards = container.querySelectorAll(".bg-white.rounded-lg.shadow-sm.p-6")
      expect(cards).toHaveLength(4)
    })
  })

  describe("Focus Time Chart", () => {
    it("should render line chart for focus time", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)
      expect(screen.getByTestId("line-chart")).toBeInTheDocument()
    })

    it("should sort daily data by date", () => {
      const unsortedData = [
        { date: "2024-01-03", minutes: 150, sessions: 4 },
        { date: "2024-01-01", minutes: 120, sessions: 3 },
        { date: "2024-01-02", minutes: 90, sessions: 2 },
      ]
      render(<Charts dailyData={unsortedData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const lineChart = screen.getByTestId("line-chart")
      const data = JSON.parse(lineChart.getAttribute("data-data") || "[]")
      expect(data[0].date).toBe("Jan 1")
      expect(data[1].date).toBe("Jan 2")
      expect(data[2].date).toBe("Jan 3")
    })

    it("should format dates to short format", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const lineChart = screen.getByTestId("line-chart")
      const data = JSON.parse(lineChart.getAttribute("data-data") || "[]")
      expect(data[0].date).toMatch(/Jan \d+/)
    })

    it("should render line with primary color", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const line = screen.getByTestId("line")
      expect(line.getAttribute("data-datakey")).toBe("minutes")
      expect(line.getAttribute("data-stroke")).toBe("#0ea5e9")
    })

    it("should render responsive container with correct height", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const containers = screen.getAllByTestId("responsive-container")
      const focusTimeContainer = containers.find((c) => c.style.height === "300px")
      expect(focusTimeContainer).toBeInTheDocument()
    })
  })

  describe("Sessions Per Day Chart", () => {
    it("should render bar chart for sessions", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)
      expect(screen.getByTestId("bar-chart")).toBeInTheDocument()
    })

    it("should map sessions data correctly", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const barChart = screen.getByTestId("bar-chart")
      const data = JSON.parse(barChart.getAttribute("data-data") || "[]")
      expect(data[0]).toHaveProperty("sessions")
      expect(data[0].sessions).toBe(3)
    })

    it("should render bar with primary fill", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const bar = screen.getByTestId("bar")
      expect(bar.getAttribute("data-datakey")).toBe("sessions")
      expect(bar.getAttribute("data-fill")).toBe("#0ea5e9")
    })
  })

  describe("Task Status Pie Chart", () => {
    it("should render pie chart for task status", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const pieCharts = screen.getAllByTestId("pie-chart")
      const statusPie = pieCharts.find((pie) => {
        const pieElement = pie.querySelector('[data-testid="pie"]')
        return pieElement?.getAttribute("data-data")?.includes("To Do")
      })
      expect(statusPie).toBeInTheDocument()
    })

    it("should include all task statuses", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const pieCharts = screen.getAllByTestId("pie-chart")
      const statusPie = pieCharts.find((pie) => {
        const pieElement = pie.querySelector('[data-testid="pie"]')
        const data = pieElement?.getAttribute("data-data")
        return data?.includes("To Do") && data?.includes("In Progress") && data?.includes("Completed")
      })
      expect(statusPie).toBeInTheDocument()
    })

    it("should have correct data values for task status", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const pieCharts = screen.getAllByTestId("pie-chart")
      const statusPie = pieCharts.find((pie) => {
        const pieElement = pie.querySelector('[data-testid="pie"]')
        const data = pieElement?.getAttribute("data-data")
        if (!data) return false
        const parsed = JSON.parse(data)
        return parsed.some((d: any) => d.name === "To Do" && d.value === 3)
      })
      expect(statusPie).toBeInTheDocument()
    })
  })

  describe("Task Priority Pie Chart", () => {
    it("should render pie chart for task priority", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const pieCharts = screen.getAllByTestId("pie-chart")
      const priorityPie = pieCharts.find((pie) => {
        const pieElement = pie.querySelector('[data-testid="pie"]')
        return pieElement?.getAttribute("data-data")?.includes("High")
      })
      expect(priorityPie).toBeInTheDocument()
    })

    it("should include all priority levels", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const pieCharts = screen.getAllByTestId("pie-chart")
      const priorityPie = pieCharts.find((pie) => {
        const pieElement = pie.querySelector('[data-testid="pie"]')
        const data = pieElement?.getAttribute("data-data")
        return data?.includes("High") && data?.includes("Medium") && data?.includes("Low")
      })
      expect(priorityPie).toBeInTheDocument()
    })

    it("should have correct data values for priorities", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const pieCharts = screen.getAllByTestId("pie-chart")
      const priorityPie = pieCharts.find((pie) => {
        const pieElement = pie.querySelector('[data-testid="pie"]')
        const data = pieElement?.getAttribute("data-data")
        if (!data) return false
        const parsed = JSON.parse(data)
        return parsed.some((d: any) => d.name === "High" && d.value === 2)
      })
      expect(priorityPie).toBeInTheDocument()
    })
  })

  describe("Chart Components", () => {
    it("should render XAxis for line chart", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)
      const xAxes = screen.getAllByTestId("x-axis")
      expect(xAxes.length).toBeGreaterThan(0)
    })

    it("should render YAxis with label", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)
      const yAxes = screen.getAllByTestId("y-axis")
      expect(yAxes.length).toBeGreaterThan(0)
    })

    it("should render CartesianGrid", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)
      const grids = screen.getAllByTestId("cartesian-grid")
      expect(grids.length).toBeGreaterThan(0)
    })

    it("should render Tooltip", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)
      const tooltips = screen.getAllByTestId("tooltip")
      expect(tooltips.length).toBeGreaterThan(0)
    })

    it("should render Legend", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)
      const legends = screen.getAllByTestId("legend")
      expect(legends.length).toBeGreaterThan(0)
    })
  })

  describe("Grid Layout", () => {
    it("should render pie charts in grid layout", () => {
      const { container } = render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const grid = container.querySelector(".grid.grid-cols-1.md\\:grid-cols-2")
      expect(grid).toBeInTheDocument()
    })

    it("should apply gap between pie chart containers", () => {
      const { container } = render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const grid = container.querySelector(".gap-6")
      expect(grid).toBeInTheDocument()
    })
  })

  describe("Empty Data Handling", () => {
    it("should render charts with empty daily data", () => {
      render(<Charts dailyData={[]} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("Focus Time Over Period")).toBeInTheDocument()
      expect(screen.getByTestId("line-chart")).toBeInTheDocument()
    })

    it("should render charts with zero task stats", () => {
      const emptyTaskStats = {
        total: 0,
        todo: 0,
        inProgress: 0,
        completed: 0,
        highPriority: 0,
        mediumPriority: 0,
        lowPriority: 0,
      }
      render(<Charts dailyData={mockDailyData} taskStats={emptyTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("Task Status")).toBeInTheDocument()
      expect(screen.getByText("Task Priority")).toBeInTheDocument()
    })

    it("should render charts with zero session stats", () => {
      const emptySessionStats = {
        total: 0,
        completed: 0,
        cancelled: 0,
        totalMinutes: 0,
      }
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={emptySessionStats} />)

      expect(screen.getByText("Focus Time Over Period")).toBeInTheDocument()
      expect(screen.getByText("Sessions Per Day")).toBeInTheDocument()
    })
  })

  describe("Data Transformation", () => {
    it("should transform date strings to formatted dates", () => {
      const testData = [
        { date: "2024-12-25", minutes: 60, sessions: 1 },
      ]
      render(<Charts dailyData={testData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const lineChart = screen.getByTestId("line-chart")
      const data = JSON.parse(lineChart.getAttribute("data-data") || "[]")
      expect(data[0].date).toBe("Dec 25")
    })

    it("should handle single day data", () => {
      const singleDay = [
        { date: "2024-01-01", minutes: 120, sessions: 3 },
      ]
      render(<Charts dailyData={singleDay} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByTestId("line-chart")).toBeInTheDocument()
      expect(screen.getByTestId("bar-chart")).toBeInTheDocument()
    })
  })

  describe("Card Styling", () => {
    it("should apply correct styling to chart cards", () => {
      const { container } = render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const cards = container.querySelectorAll(".bg-white.rounded-lg.shadow-sm.p-6")
      cards.forEach((card) => {
        expect(card).toHaveClass("bg-white")
        expect(card).toHaveClass("rounded-lg")
        expect(card).toHaveClass("shadow-sm")
        expect(card).toHaveClass("p-6")
      })
    })

    it("should render headings with correct styling", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByText("Focus Time Over Period")).toBeInTheDocument()
      expect(screen.getByText("Sessions Per Day")).toBeInTheDocument()
      expect(screen.getByText("Task Status")).toBeInTheDocument()
      expect(screen.getByText("Task Priority")).toBeInTheDocument()

      const headings = screen.getAllByText((content, element) => {
        return element?.tagName === "H3" && element?.classList.contains("text-lg")
      })
      expect(headings.length).toBe(4)
    })
  })

  describe("Responsive Containers", () => {
    it("should render responsive container for line chart", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const containers = screen.getAllByTestId("responsive-container")
      expect(containers.length).toBeGreaterThanOrEqual(2)
    })

    it("should set height to 300 for line and bar charts", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const containers = screen.getAllByTestId("responsive-container")
      const tallContainers = containers.filter((c) => c.style.height === "300px")
      expect(tallContainers.length).toBeGreaterThanOrEqual(2)
    })

    it("should set height to 250 for pie charts", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const containers = screen.getAllByTestId("responsive-container")
      const pieContainers = containers.filter((c) => c.style.height === "250px")
      expect(pieContainers.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe("Full Integration", () => {
    it("should render all charts with complete data", () => {
      render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      expect(screen.getByTestId("line-chart")).toBeInTheDocument()
      expect(screen.getByTestId("bar-chart")).toBeInTheDocument()
      expect(screen.getAllByTestId("pie-chart").length).toBe(2)
    })

    it("should render all 4 chart cards", () => {
      const { container } = render(<Charts dailyData={mockDailyData} taskStats={mockTaskStats} sessionStats={mockSessionStats} />)

      const cards = container.querySelectorAll(".bg-white.rounded-lg.shadow-sm.p-6")
      expect(cards).toHaveLength(4)
    })
  })
})
