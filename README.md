# FocusFlow

A modern, single-user productivity app that blends **TickTick-class task management** with focus tracking. Organize tasks into lists with subtasks, tags, recurrence, reminders, and long-horizon date views; build habits and goals; run Pomodoro sessions; and get AI-powered insights and a chat assistant from the provider of your choice.

## Features

### Tasks
- **Lists & Inbox**: Group tasks into custom lists; anything without a list lives in the Inbox
- **Subtasks**: Break a task into a checklist of child tasks with a progress badge
- **Tags**: Free-form, per-user tags with AND filtering
- **Priorities & dates**: None/Low/Medium/High priority, start date, and due date
- **Recurrence**: Daily / weekly / monthly / yearly repeats that roll the task forward on completion
- **Reminders**: Schedule one or more reminder times per task, delivered as in-app banners and browser notifications while the app is open
- **Multiple views**: Switch between **Board** (Kanban drag-and-drop), **List** (time-grouped), **Calendar** (month grid by due date), and **Matrix** (Eisenhower urgency × importance)
- **Smart lists / date horizons**: One-click views for Overdue, Today, Tomorrow, Next 7 Days, This Month, Next Month, This Year, Next Year, No Date, and a Custom range
- **Saved filters**: Name and save the current filter/sort/view combination as a reusable sidebar view

### Habits
- **Flexible frequency**: Every day, specific days of the week, or a number of times per week
- **Goal types**: Simple check-off ("achieve") or a target amount per day (e.g. 8 glasses of water)
- **Streaks & stats**: Current/best streaks (day- or week-based), monthly completion rate, and a GitHub-style contribution heatmap
- **Dashboard widget**: Quick check-ins from the dashboard

### Goals
- **Progress types**: Manual (0–100%), numeric (current/target with a unit), or **task-derived** (progress computed from linked tasks)
- **Lifecycle**: Active → achieved → archived, with a detail panel listing linked tasks
- **Dashboard widget**: Track active goals at a glance

### Focus & Insights
- **Pomodoro Timer**: Customizable Focus / Short Break / Long Break intervals (25/5/15 minutes), optionally tied to a task
- **Productivity Dashboard**: Charts for focus time, sessions, and task completion, alongside goals and habits widgets
- **AI-Powered Insights**: Personalized productivity recommendations generated from your data
- **AI Assistant**: A chat assistant (with function/tool calling) that can read and act on your tasks, goals, habits, and reminders — powered by the AI provider you pick in Settings

## Tech Stack

- **Framework**: Next.js 15 (App Router) with React 19
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL with Prisma ORM 7 (`@prisma/adapter-pg`)
- **Authentication**: NextAuth.js v5 (credentials provider)
- **Drag & drop**: dnd-kit
- **Charts**: Recharts
- **Dates**: date-fns
- **Markdown**: react-markdown + remark-gfm (for chat rendering)
- **Validation**: Zod
- **AI**: OpenAI SDK against any OpenAI-compatible provider — **Groq (default)**, OpenAI, Anthropic (Claude), DeepSeek, or Google Gemini
- **Password Hashing**: bcryptjs
- **Testing**: Jest + Testing Library (74 test suites)

## Getting Started

### Prerequisites

- Node.js 18.18+ (Node 20+ recommended) and npm
- PostgreSQL database
- An API key for at least one AI provider (optional, for AI insights & assistant) — Groq is the default: [https://console.groq.com/](https://console.groq.com/)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd Focus_Flow
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Edit `.env` and set your values:
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/focusflow"

# NextAuth
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-auth-secret-here"

# AI provider (default). Options: groq | openai | anthropic | deepseek | gemini
AI_PROVIDER="groq"
GROQ_API_KEY="your-groq-api-key-here"
```

Generate a `NEXTAUTH_SECRET`:
```bash
openssl rand -base64 32
```

4. Set up the database (applies the committed migrations, then generates the client):
```bash
npx prisma migrate deploy
npx prisma generate
```

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Running tests

```bash
npm test              # run the Jest suite once
npm run test:watch    # watch mode
npm run test:coverage # coverage report
```

## Usage

### 1. Sign Up & Sign In
- Visit the home page, click "Sign Up", and create an account with email + password
- Sign in to reach the dashboard

### 2. Manage Tasks
- Go to the **Tasks** workspace
- Create tasks with a title, description, list, priority, tags, due/start dates, recurrence, subtasks, and reminders
- Switch views (Board / List / Calendar / Matrix) and use the sidebar smart lists (Today, This Month, etc.), lists, tags, and saved filters to slice your work

### 3. Build Habits
- Go to **Habits**, add a habit with an icon, color, frequency, and goal type
- Check in daily; watch streaks, monthly rate, and the heatmap grow

### 4. Track Goals
- Go to **Goals**, create a goal with manual, numeric, or task-derived progress
- Link tasks to a task-derived goal so completing them advances the goal automatically

### 5. Use the Pomodoro Timer
- Go to **Timer**, pick Focus (25 min), Short Break (5 min), or Long Break (15 min)
- Optionally associate a task, then Start; a sound plays when the session completes

### 6. Review Analytics & Ask the Assistant
- The **Dashboard** shows focus time, sessions, task-completion stats, AI insights, and goals/habits widgets
- Open the chat assistant (bottom-right) to ask about — or make changes to — your tasks, goals, habits, and reminders
- Choose your AI provider on the **Settings** page

## Project Structure

```
Focus_Flow/
├── prisma/
│   ├── schema.prisma              # Database schema
│   └── migrations/                # Committed SQL migrations
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/ # NextAuth API
│   │   │   ├── auth/signup/        # Sign-up endpoint
│   │   │   ├── analytics/          # Analytics data
│   │   │   ├── ai/insights/        # AI recommendations
│   │   │   ├── chat/               # AI assistant (tool calling)
│   │   │   └── reminders/due/      # Due-reminder dispatch query
│   │   ├── auth/{signin,signup}/   # Auth pages
│   │   ├── tasks/                  # Tasks workspace (board/list/calendar/matrix)
│   │   ├── timer/                  # Pomodoro timer
│   │   ├── habits/                 # Habits
│   │   ├── goals/                  # Goals
│   │   ├── dashboard/              # Dashboard
│   │   ├── settings/               # AI provider settings
│   │   ├── actions/                # Server actions (tasks, lists, tags, habits, goals, …)
│   │   ├── layout.tsx              # Root layout
│   │   └── page.tsx                # Home page
│   ├── components/
│   │   ├── tasks/                  # Task workspace, board, views, forms
│   │   ├── habits/                 # Habit board, rows, heatmap, detail
│   │   ├── goals/                  # Goal board, cards, detail
│   │   ├── timer/                  # Pomodoro timer
│   │   ├── dashboard/              # Dashboard widgets & charts
│   │   ├── chat/                   # AI assistant widget
│   │   ├── reminders/             # Reminder dispatcher
│   │   ├── settings/               # AI settings form
│   │   ├── ui/                     # Reusable UI components
│   │   └── Navigation.tsx          # Navigation bar
│   ├── lib/
│   │   ├── prisma.ts               # Prisma client
│   │   ├── auth.ts                 # NextAuth config
│   │   ├── aiProviders.ts          # Multi-provider AI registry & client
│   │   ├── openai.ts               # Insights generation
│   │   ├── chatAssistant.ts        # Assistant helpers
│   │   ├── dateHorizon.ts          # Smart-list date ranges
│   │   ├── taskFilters.ts          # Task filtering/sorting
│   │   ├── recurrence.ts           # Recurrence engine
│   │   ├── habitStats.ts           # Habit streaks/stats
│   │   ├── goalStats.ts            # Goal progress
│   │   ├── subtasks.ts / savedFilters.ts / taskConstants.ts / ...
│   └── types/                      # TypeScript types
├── .env                            # Environment variables
├── .env.example                    # Environment template
└── README.md
```

## Database Schema

Core models (see `prisma/schema.prisma` for the full definition):

- **User** — id, email, password (hashed), name, `aiProvider` preference, timestamps
- **Task** — title, description, status (todo/in-progress/completed/wont-do), priority, start/due dates, order, subtasks (self-relation), `listId`, tags, `recurrenceId`, `goalId`, reminders, timestamps
- **List** — per-user task container (null list = Inbox)
- **Tag** / **TaskTag** — normalized per-user tags and the task↔tag join
- **RecurrenceRule** — freq/interval/byWeekday/anchor/until/count for repeating tasks
- **Reminder** — absolute `triggerAt` + `dispatchedAt` for a task
- **Habit** / **HabitCheckIn** — habit definition (frequency/goal type) and per-day check-ins
- **Goal** — outcome with manual/numeric/task-derived progress, status, optional deadline
- **SavedFilter** — a named, canonicalized task-view query
- **FocusSession** — Pomodoro/break sessions tied to a user and optionally a task

## AI Providers

FocusFlow's assistant and insights run on any OpenAI-SDK-compatible provider. Add a key for each provider you want to use, then pick the active one on the **Settings** page (per-user). `AI_PROVIDER` sets the default when a user hasn't chosen one.

| Provider | Env key | Default model | Get a key |
|----------|---------|---------------|-----------|
| Groq (Llama) — default | `GROQ_API_KEY` | `llama-3.3-70b-versatile` | [console.groq.com](https://console.groq.com/) |
| OpenAI (GPT) | `OPENAI_API_KEY` | `gpt-4o-mini` | [platform.openai.com](https://platform.openai.com/api-keys) |
| Claude (Anthropic) | `ANTHROPIC_API_KEY` | `claude-3-5-haiku-latest` | [console.anthropic.com](https://console.anthropic.com/) |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` | [platform.deepseek.com](https://platform.deepseek.com/) |
| Gemini (Google) | `GEMINI_API_KEY` | `gemini-2.0-flash` | [aistudio.google.com](https://aistudio.google.com/apikey) |

Override any model with the matching `*_MODEL` env var (e.g. `OPENAI_MODEL`). Provider selection and model overrides live in `src/lib/aiProviders.ts`.

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub

2. Set up a PostgreSQL database (Vercel Postgres, Supabase, Neon, …) and get the connection string

3. Create a project on Vercel:
```bash
npm install -g vercel
vercel login
vercel link
vercel
```

4. Add environment variables in the Vercel dashboard:
   - `DATABASE_URL`
   - `NEXTAUTH_URL` and `NEXTAUTH_SECRET`
   - `AI_PROVIDER` and at least one provider key (e.g. `GROQ_API_KEY`)

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

### AI Provider & Model
Set the default provider and keys in `.env` (see [AI Providers](#ai-providers)). The provider registry — base URLs, default models, and `*_MODEL` overrides — lives in `src/lib/aiProviders.ts`.

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running
- Check `DATABASE_URL` is correct and the database exists
- Verify database credentials, then re-run `npx prisma migrate deploy`

### AI Insights / Assistant Not Working
- Verify a provider key is set (e.g. `GROQ_API_KEY`) and `AI_PROVIDER` matches a configured provider
- On the Settings page, only providers with a configured key are selectable
- Check the key has sufficient balance/quota
- If a specific provider errors, try overriding its `*_MODEL` (default model ids can drift over time)
- Check the server console for errors

### NextAuth Issues
- Clear browser cookies
- Verify `NEXTAUTH_URL` and `NEXTAUTH_SECRET` are set
- Check the NextAuth configuration in `src/lib/auth.ts`

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License — feel free to use this project for personal or commercial purposes.

## Acknowledgments

- Built with [Next.js](https://nextjs.org/)
- Inspired by [TickTick](https://ticktick.com/) and modern productivity tools
- Pomodoro Technique by Francesco Cirillo
