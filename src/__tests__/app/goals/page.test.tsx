import { redirect } from "next/navigation"
import { render } from "@testing-library/react"
import GoalsPage from "@/app/goals/page"

jest.mock("next/navigation", () => ({ redirect: jest.fn() }))
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))
jest.mock("@/app/actions/goals", () => ({ getGoals: jest.fn() }))
jest.mock("@/components/goals/GoalBoard", () => {
  return function MockBoard({ goals }: any) {
    return (
      <div data-testid="goal-board" data-count={goals?.length ?? 0}>
        GoalBoard
      </div>
    )
  }
})

import { auth } from "@/lib/auth"
import { getGoals } from "@/app/actions/goals"
const mockAuth = auth as jest.MockedFunction<typeof auth>
const mockGetGoals = getGoals as jest.MockedFunction<typeof getGoals>
const mockRedirect = redirect as jest.MockedFunction<typeof redirect>

describe("Goals Page", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetGoals.mockResolvedValue([])
  })

  it("redirects to signin when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    await GoalsPage()
    expect(mockRedirect).toHaveBeenCalledWith("/auth/signin")
  })

  it("renders the board with the fetched goals", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as any)
    mockGetGoals.mockResolvedValue([{ id: "g1" }] as any)
    const { container } = render(await GoalsPage())
    const board = container.querySelector('[data-testid="goal-board"]')
    expect(board).toBeInTheDocument()
    expect(board?.getAttribute("data-count")).toBe("1")
  })
})
