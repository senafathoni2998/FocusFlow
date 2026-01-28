"use client"

import { useState, useEffect, useRef } from "react"
import { startSession, completeSession, cancelSession } from "@/app/actions/sessions"
import { getTasks } from "@/app/actions/tasks"

interface Task {
  id: string
  title: string
}

type TimerType = "pomodoro" | "short-break" | "long-break"
type TimerStatus = "idle" | "running" | "paused"

const TIMER_DURATIONS = {
  "pomodoro": 25 * 60, // 25 minutes
  "short-break": 5 * 60, // 5 minutes
  "long-break": 15 * 60 // 15 minutes
}

const TIMER_LABELS = {
  "pomodoro": "Focus Time",
  "short-break": "Short Break",
  "long-break": "Long Break"
}

export default function PomodoroTimer() {
  const [type, setType] = useState<TimerType>("pomodoro")
  const [status, setStatus] = useState<TimerStatus>("idle")
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATIONS.pomodoro)
  const [tasks, setTasks] = useState<Task[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Load tasks on mount
  useEffect(() => {
    loadTasks()
  }, [])

  // Timer effect
  useEffect(() => {
    if (status === "running" && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => prev - 1)
      }, 1000)
    } else if (timeLeft === 0 && status === "running") {
      handleTimerComplete()
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [status, timeLeft])

  const loadTasks = async () => {
    const userTasks = await getTasks()
    setTasks(userTasks.filter((t: any) => t.status !== "completed"))
  }

  const handleTypeChange = (newType: TimerType) => {
    if (status === "running") {
      if (!confirm("Timer is running. Switch anyway?")) return
    }

    setType(newType)
    setStatus("idle")
    setTimeLeft(TIMER_DURATIONS[newType])
    if (intervalRef.current) clearInterval(intervalRef.current)
  }

  const handleStart = async () => {
    const result = await startSession(selectedTaskId, type, TIMER_DURATIONS[type])

    if (result.success && result.session) {
      setCurrentSessionId(result.session.id)
      setStatus("running")
    }
  }

  const handlePause = () => {
    setStatus("paused")
    if (intervalRef.current) clearInterval(intervalRef.current)
  }

  const handleResume = () => {
    setStatus("running")
  }

  const handleReset = async () => {
    if (currentSessionId) {
      await cancelSession(currentSessionId)
    }

    setStatus("idle")
    setTimeLeft(TIMER_DURATIONS[type])
    setCurrentSessionId(null)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }

  const handleTimerComplete = async () => {
    setStatus("idle")

    if (currentSessionId) {
      await completeSession(currentSessionId, new Date())
    }

    setCurrentSessionId(null)
    setTimeLeft(TIMER_DURATIONS[type])

    // Play notification sound
    if (typeof window !== "undefined" && "AudioContext" in window) {
      try {
        const audioContext = new AudioContext()
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)

        oscillator.frequency.value = 800
        oscillator.type = "sine"

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 0.5)
      } catch (error) {
        console.error("Could not play sound:", error)
      }
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const progress = ((TIMER_DURATIONS[type] - timeLeft) / TIMER_DURATIONS[type]) * 100

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">
          {TIMER_LABELS[type]}
        </h2>

        {/* Timer Type Selector */}
        <div className="flex justify-center gap-3 mb-8">
          <button
            onClick={() => handleTypeChange("pomodoro")}
            className={`px-4 py-2 rounded-lg transition ${
              type === "pomodoro"
                ? "bg-primary-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Focus
          </button>
          <button
            onClick={() => handleTypeChange("short-break")}
            className={`px-4 py-2 rounded-lg transition ${
              type === "short-break"
                ? "bg-success-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Short Break
          </button>
          <button
            onClick={() => handleTypeChange("long-break")}
            className={`px-4 py-2 rounded-lg transition ${
              type === "long-break"
                ? "bg-success-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Long Break
          </button>
        </div>

        {/* Task Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Associated Task (Optional)
          </label>
          <select
            value={selectedTaskId || ""}
            onChange={(e) => setSelectedTaskId(e.target.value || null)}
            disabled={status === "running"}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="">No task selected</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {task.title}
              </option>
            ))}
          </select>
        </div>

        {/* Timer Display */}
        <div className="relative mb-8">
          <div className="text-center">
            <div className="text-8xl font-bold text-gray-900 font-mono">
              {formatTime(timeLeft)}
            </div>
          </div>

          {/* Progress Ring */}
          <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 -z-10">
            <circle
              cx="144"
              cy="144"
              r="140"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              className="text-gray-200"
            />
            <circle
              cx="144"
              cy="144"
              r="140"
              stroke="currentColor"
              strokeWidth="8"
              fill="none"
              strokeDasharray={`${2 * Math.PI * 140}`}
              strokeDashoffset={`${2 * Math.PI * 140 * (1 - progress / 100)}`}
              className={`${
                type === "pomodoro"
                  ? "text-primary-600"
                  : "text-success-600"
              } transition-all duration-1000`}
              transform="rotate(-90 144 144)"
            />
          </svg>
        </div>

        {/* Controls */}
        <div className="flex justify-center gap-4">
          {status === "idle" && (
            <button
              onClick={handleStart}
              className="px-8 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium text-lg"
            >
              Start
            </button>
          )}

          {status === "running" && (
            <>
              <button
                onClick={handlePause}
                className="px-8 py-3 bg-warning-600 text-white rounded-lg hover:bg-warning-700 transition font-medium text-lg"
              >
                Pause
              </button>
              <button
                onClick={handleReset}
                className="px-8 py-3 bg-danger-600 text-white rounded-lg hover:bg-danger-700 transition font-medium text-lg"
              >
                Reset
              </button>
            </>
          )}

          {status === "paused" && (
            <>
              <button
                onClick={handleResume}
                className="px-8 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition font-medium text-lg"
              >
                Resume
              </button>
              <button
                onClick={handleReset}
                className="px-8 py-3 bg-danger-600 text-white rounded-lg hover:bg-danger-700 transition font-medium text-lg"
              >
                Reset
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
