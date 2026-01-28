"use client"

import { useState, useEffect } from "react"

export default function AIInsights() {
  const [insights, setInsights] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")

  const fetchInsights = async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      const response = await fetch("/api/ai/insights")

      if (!response.ok) {
        throw new Error("Failed to fetch insights")
      }

      const data = await response.json()
      setInsights(data.insights || [])
      setError(data.error || "")
    } catch (err) {
      console.error("Error fetching insights:", err)
      setError("Failed to load insights")
      setInsights([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchInsights()
  }, [])

  const handleRefresh = () => {
    fetchInsights(true)
  }

  return (
    <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🤖</span>
          <h3 className="text-lg font-semibold text-gray-900">AI Insights</h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-primary-600 hover:text-primary-700 disabled:opacity-50 text-sm font-medium"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="bg-warning-50 border border-warning-200 text-warning-800 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-full"></div>
            </div>
          ))}
        </div>
      ) : insights.length > 0 ? (
        <ul className="space-y-3">
          {insights.map((insight, index) => (
            <li
              key={index}
              className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
            >
              <span className="text-primary-600 mt-0.5">•</span>
              <span className="text-sm text-gray-700">{insight}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-500 text-sm">No insights available yet. Start tracking your tasks and sessions!</p>
      )}

      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          Insights are generated based on your tasks and focus sessions. Add more data to get personalized recommendations.
        </p>
      </div>
    </div>
  )
}
