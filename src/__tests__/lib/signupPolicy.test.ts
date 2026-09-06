/**
 * @jest-environment node
 */
import { isSignupOpen } from "@/lib/signupPolicy"

const ORIGINAL = process.env.ALLOW_SIGNUP
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ALLOW_SIGNUP
  else process.env.ALLOW_SIGNUP = ORIGINAL
})

describe("isSignupOpen", () => {
  it("is OPEN when the variable is unset — what every existing deployment had", () => {
    delete process.env.ALLOW_SIGNUP
    expect(isSignupOpen()).toBe(true)
  })

  it("is OPEN on an empty value, which is what an unset compose variable expands to", () => {
    process.env.ALLOW_SIGNUP = ""
    expect(isSignupOpen()).toBe(true)
  })

  it.each(["false", "FALSE", "0", "no", "off", "  false  "])("closes on %j", (v) => {
    process.env.ALLOW_SIGNUP = v
    expect(isSignupOpen()).toBe(false)
  })

  it.each(["true", "1", "yes", "on", "anything-else"])("stays open on %j", (v) => {
    process.env.ALLOW_SIGNUP = v
    expect(isSignupOpen()).toBe(true)
  })
})
