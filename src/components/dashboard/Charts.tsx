"use client"

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts"

interface DailyData {
  date: string
  minutes: number
  sessions: number
}

interface TaskStats {
  total: number
  todo: number
  inProgress: number
  completed: number
  highPriority: number
  mediumPriority: number
  lowPriority: number
}

interface SessionStats {
  total: number
  completed: number
  cancelled: number
  totalMinutes: number
}

interface ChartsProps {
  dailyData: DailyData[]
  taskStats: TaskStats
  sessionStats: SessionStats
}

const COLORS = {
  primary: "#0ea5e9",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444"
}

const TASK_STATUS_COLORS = ["#94a3b8", "#0ea5e9", "#22c55e"]

export default function Charts({ dailyData, taskStats, sessionStats }: ChartsProps) {
  // Prepare data for charts
  const focusTimeData = dailyData
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((d) => ({
      ...d,
      date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    }))

  const sessionsPerDayData = focusTimeData.map((d) => ({
    date: d.date,
    sessions: d.sessions
  }))

  const taskStatusData = [
    { name: "To Do", value: taskStats.todo, color: TASK_STATUS_COLORS[0] },
    { name: "In Progress", value: taskStats.inProgress, color: TASK_STATUS_COLORS[1] },
    { name: "Completed", value: taskStats.completed, color: TASK_STATUS_COLORS[2] }
  ]

  const taskPriorityData = [
    { name: "High", value: taskStats.highPriority, color: COLORS.danger },
    { name: "Medium", value: taskStats.mediumPriority, color: COLORS.warning },
    { name: "Low", value: taskStats.lowPriority, color: COLORS.success }
  ]

  return (
    <div className="space-y-6">
      {/* Focus Time Chart */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Focus Time Over Period</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={focusTimeData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              stroke="#666"
              style={{ fontSize: "12px" }}
            />
            <YAxis
              stroke="#666"
              label={{ value: "Minutes", angle: -90, position: "insideLeft" }}
              style={{ fontSize: "12px" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "8px"
              }}
              formatter={(value: number) => [`${value} min`, "Focus Time"]}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="minutes"
              stroke={COLORS.primary}
              strokeWidth={2}
              dot={{ fill: COLORS.primary, r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Sessions Per Day Chart */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Sessions Per Day</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={sessionsPerDayData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              stroke="#666"
              style={{ fontSize: "12px" }}
            />
            <YAxis
              stroke="#666"
              label={{ value: "Sessions", angle: -90, position: "insideLeft" }}
              style={{ fontSize: "12px" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "white",
                border: "1px solid #e5e7eb",
                borderRadius: "8px"
              }}
              formatter={(value: number) => [value, "Sessions"]}
            />
            <Legend />
            <Bar dataKey="sessions" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Task Status and Priority Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Task Status Pie Chart */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Task Status</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={taskStatusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {taskStatusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Task Priority Pie Chart */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Task Priority</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={taskPriorityData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {taskPriorityData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
