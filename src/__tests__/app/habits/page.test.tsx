import { redirect } from "next/navigation"
import { render } from "@testing-library/react"
import HabitsPage from "@/app/habits/page"

jest.mock("next/navigation", () => ({ redirect: jest.fn() }))
jest.mock("@/lib/auth", () => ({ auth: jest.fn() }))
jest.mock("@/app/actions/habits", () => ({ getHabits: jest.fn() }))
jest.mock("@/components/habits/HabitBoard", () => {
  return function MockBoard({ habits }: any) {
    return (
      <div data-testid="habit-board" data-count={habits?.length ?? 0}>
        HabitBoard
      </div>
    )
  }
})

import { auth } from "@/lib/auth"
import { getHabits } from "@/app/actions/habits"
const mockAuth = auth as jest.MockedFunction<typeof auth>
const mockGetHabits = getHabits as jest.MockedFunction<typeof getHabits>
const mockRedirect = redirect as jest.MockedFunction<typeof redirect>

describe("Habits Page", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetHabits.mockResolvedValue([])
  })

  it("redirects to signin when unauthenticated", async () => {
    mockAuth.mockResolvedValue(null)
    await HabitsPage()
    expect(mockRedirect).toHaveBeenCalledWith("/auth/signin")
  })

  it("renders the board with the fetched habits", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } } as any)
    mockGetHabits.mockResolvedValue([{ id: "h1" }] as any)
    const { container } = render(await HabitsPage())
    const board = container.querySelector('[data-testid="habit-board"]')
    expect(board).toBeInTheDocument()
    expect(board?.getAttribute("data-count")).toBe("1")
  })
})
