const mockCreate = jest.fn()

const mockChat = {
  completions: {
    create: mockCreate,
  },
}

class MockOpenAI {
  constructor() {
    // Mock constructor
  }

  chat = mockChat
}

export default MockOpenAI
