"use client"

interface TaskStats {
  total: number
  todo: number
  inProgress: number
  completed: number
}

interface SessionStats {
  total: number
  completed: number
  cancelled: number
  totalMinutes: number
}

interface StatsCardsProps {
  taskStats: TaskStats
  sessionStats: SessionStats
}

export default function StatsCards({ taskStats, sessionStats }: StatsCardsProps) {
  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`
  }

  const cards = [
    {
      title: "Total Focus Time",
      value: formatMinutes(sessionStats.totalMinutes),
      icon: "⏱️",
      color: "primary",
      description: "This period"
    },
    {
      title: "Sessions Completed",
      value: sessionStats.completed.toString(),
      icon: "✅",
      color: "success",
      description: `${sessionStats.total} total sessions`
    },
    {
      title: "Tasks Completed",
      value: taskStats.completed.toString(),
      icon: "📋",
      color: "primary",
      description: `${taskStats.inProgress} in progress`
    },
    {
      title: "Completion Rate",
      value: taskStats.total > 0
        ? `${Math.round((taskStats.completed / taskStats.total) * 100)}%`
        : "0%",
      icon: "📊",
      color: "warning",
      description: "Task completion"
    }
  ]

  const colorClasses = {
    primary: "bg-primary-50 border-primary-200",
    success: "bg-success-50 border-success-200",
    warning: "bg-warning-50 border-warning-200",
    danger: "bg-danger-50 border-danger-200"
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card, index) => (
        <div
          key={index}
          className={`bg-white rounded-lg shadow-sm border-2 ${colorClasses[card.color as keyof typeof colorClasses]} p-6`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">{card.icon}</span>
            <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">
              {card.title}
            </span>
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-1">
            {card.value}
          </div>
          <div className="text-sm text-gray-600">
            {card.description}
          </div>
        </div>
      ))}
    </div>
  )
}
