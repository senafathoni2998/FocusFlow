"use client"

import { useState } from "react"
import TaskCard from "./TaskCard"
import CreateTaskForm from "./CreateTaskForm"

interface Task {
  id: string
  title: string
  description?: string | null
  status: string
  priority: string
  dueDate?: Date | null
}

interface TaskBoardProps {
  tasks: Task[]
  onUpdate?: () => void
}

export default function TaskBoard({ tasks, onUpdate }: TaskBoardProps) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [filter, setFilter] = useState<"all" | "todo" | "in-progress" | "completed">("all")
  const [priorityFilter, setPriorityFilter] = useState<"all" | "low" | "medium" | "high">("all")

  const filteredTasks = tasks.filter((task) => {
    if (filter !== "all" && task.status !== filter) return false
    if (priorityFilter !== "all" && task.priority !== priorityFilter) return false
    return true
  })

  const tasksByStatus = {
    todo: filteredTasks.filter((t) => t.status === "todo"),
    "in-progress": filteredTasks.filter((t) => t.status === "in-progress"),
    completed: filteredTasks.filter((t) => t.status === "completed")
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tasks</h1>
          <p className="text-gray-600 mt-1">Manage and track your tasks</p>
        </div>

        <button
          onClick={() => setShowCreateForm(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium"
        >
          + New Task
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1 rounded-lg text-sm transition ${
              filter === "all"
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilter("todo")}
            className={`px-3 py-1 rounded-lg text-sm transition ${
              filter === "todo"
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            To Do
          </button>
          <button
            onClick={() => setFilter("in-progress")}
            className={`px-3 py-1 rounded-lg text-sm transition ${
              filter === "in-progress"
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            In Progress
          </button>
          <button
            onClick={() => setFilter("completed")}
            className={`px-3 py-1 rounded-lg text-sm transition ${
              filter === "completed"
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Completed
          </button>
        </div>

        <div className="flex gap-2 ml-auto">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value as any)}
            className="px-3 py-1 rounded-lg text-sm bg-gray-100 text-gray-700 border-none"
          >
            <option value="all">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Task Board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* To Do Column */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-700">To Do</h2>
            <span className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full">
              {tasksByStatus.todo.length}
            </span>
          </div>
          <div className="space-y-3">
            {tasksByStatus.todo.map((task) => (
              <TaskCard key={task.id} task={task} onUpdate={onUpdate} />
            ))}
            {tasksByStatus.todo.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">No tasks</p>
            )}
          </div>
        </div>

        {/* In Progress Column */}
        <div className="bg-primary-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-700">In Progress</h2>
            <span className="bg-primary-200 text-primary-700 text-xs px-2 py-1 rounded-full">
              {tasksByStatus["in-progress"].length}
            </span>
          </div>
          <div className="space-y-3">
            {tasksByStatus["in-progress"].map((task) => (
              <TaskCard key={task.id} task={task} onUpdate={onUpdate} />
            ))}
            {tasksByStatus["in-progress"].length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">No tasks</p>
            )}
          </div>
        </div>

        {/* Completed Column */}
        <div className="bg-success-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-success-700">Completed</h2>
            <span className="bg-success-200 text-success-700 text-xs px-2 py-1 rounded-full">
              {tasksByStatus.completed.length}
            </span>
          </div>
          <div className="space-y-3">
            {tasksByStatus.completed.map((task) => (
              <TaskCard key={task.id} task={task} onUpdate={onUpdate} />
            ))}
            {tasksByStatus.completed.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-4">No tasks</p>
            )}
          </div>
        </div>
      </div>

      {/* Create Task Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Create New Task</h2>
            <CreateTaskForm onClose={() => setShowCreateForm(false)} />
          </div>
        </div>
      )}
    </div>
  )
}
