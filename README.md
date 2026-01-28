# FocusFlow

A modern productivity application that helps you manage tasks, track focus sessions using the Pomodoro technique, visualize your productivity, and get AI-powered insights to improve your workflow.

## Features

- **Task Management**: Create, update, and organize tasks with priority levels and due dates
- **Pomodoro Timer**: Built-in timer with customizable work/break intervals (25/5/15 minutes)
- **Productivity Dashboard**: Visual analytics with charts showing focus time, sessions, and task completion
- **AI-Powered Insights**: Get personalized productivity recommendations based on your data
- **Kanban Board**: Drag-and-drop style task management with todo/in-progress/completed columns
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: NextAuth.js v5 (credentials provider)
- **Charts**: Recharts
- **AI**: Z.AI API (GLM-4-Flash model)
- **Password Hashing**: bcryptjs

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database
- Z.AI API key (optional, for AI insights) - Get one at [https://z.ai/manage-apikey/apikey-list](https://z.ai/manage-apikey/apikey-list)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Focus-FLow
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your values:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/focusflow"
AUTH_SECRET="your-auth-secret-here"
ZAI_API_KEY="your-zai-api-key-here"
```

Generate an AUTH_SECRET:
```bash
openssl rand -base64 32
```

4. Set up the database:
```bash
npx prisma migrate dev --name init
npx prisma generate
```

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### 1. Sign Up
- Visit the home page and click "Sign Up"
- Enter your email and password
- Your account will be created

### 2. Sign In
- Use your email and password to sign in
- You'll be redirected to the dashboard

### 3. Create Tasks
- Go to the Tasks page
- Click "New Task"
- Fill in the title, description (optional), priority, and due date
- Click "Create Task"

### 4. Use the Pomodoro Timer
- Go to the Timer page
- Select the timer type: Focus (25 min), Short Break (5 min), or Long Break (15 min)
- Optionally associate a task with your session
- Click "Start" to begin the timer
- The timer will play a sound when complete

### 5. View Analytics
- Visit the Dashboard to see:
  - Total focus time and completed sessions
  - Task completion statistics
  - Charts showing focus time over time
  - AI-generated productivity insights

## Project Structure

```
focusflow/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/   # NextAuth API
│   │   │   ├── auth/signup/          # Sign up endpoint
│   │   │   ├── analytics/            # Analytics data
│   │   │   └── ai/insights/          # AI recommendations
│   │   ├── auth/
│   │   │   ├── signin/               # Sign in page
│   │   │   └── signup/               # Sign up page
│   │   ├── tasks/                    # Tasks page
│   │   ├── timer/                    # Timer page
│   │   ├── dashboard/                # Dashboard page
│   │   ├── actions/                  # Server actions
│   │   ├── layout.tsx                # Root layout
│   │   └── page.tsx                  # Home page
│   ├── components/
│   │   ├── tasks/                    # Task components
│   │   ├── timer/                    # Timer components
│   │   ├── dashboard/                # Dashboard components
│   │   ├── ui/                       # Reusable UI components
│   │   └── Navigation.tsx            # Navigation bar
│   ├── lib/
│   │   ├── prisma.ts                 # Prisma client
│   │   ├── auth.ts                   # NextAuth config
│   │   └── openai.ts                 # OpenAI integration
│   └── types/                        # TypeScript types
├── .env                              # Environment variables
├── .env.example                      # Environment template
└── README.md
```

## Database Schema

### User
- id, email, password (hashed), name, timestamps

### Task
- id, title, description, status, priority, dueDate, userId, timestamps

### FocusSession
- id, type, duration, status, startTime, endTime, userId, taskId, timestamp

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub

2. Set up a PostgreSQL database:
   - Use Vercel Postgres or Supabase
   - Get the connection string

3. Create a project on Vercel:
```bash
npm install -g vercel
vercel login
vercel link
vercel
```

4. Add environment variables in Vercel dashboard:
   - `DATABASE_URL`
   - `AUTH_SECRET`
   - `ZAI_API_KEY` (optional)

5. Run migrations on production:
```bash
vercel env pull .env.production
npx prisma migrate deploy
```

6. Deploy:
```bash
vercel --prod
```

## Configuration

### Timer Durations
Edit `src/components/timer/PomodoroTimer.tsx`:
```typescript
const TIMER_DURATIONS = {
  "pomodoro": 25 * 60,      // 25 minutes
  "short-break": 5 * 60,    // 5 minutes
  "long-break": 15 * 60     // 15 minutes
}
```

### AI Model
Edit `src/lib/zai.ts` to change the model:
```typescript
model: "glm-4-flash"  // Other options: "glm-4-plus", "glm-4", "glm-4-air"
```

Available Z.AI models:
- `glm-4-flash` - Fast and cost-effective (default)
- `glm-4` - Standard performance
- `glm-4-plus` - High performance
- `glm-4-air` - Balanced performance

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running
- Check DATABASE_URL is correct
- Verify database credentials

### AI Insights Not Working
- Verify ZAI_API_KEY is set
- Get an API key from [https://z.ai/manage-apikey/apikey-list](https://z.ai/manage-apikey/apikey-list)
- Check API key has sufficient balance
- Check console for errors

### NextAuth Issues
- Clear browser cookies
- Verify AUTH_SECRET is set
- Check NextAuth configuration

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - feel free to use this project for personal or commercial purposes.

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- UI design inspired by modern productivity tools
- Pomodoro Technique by Francesco Cirillo
