"use client"

import React from "react"

export interface ChatMessageProps {
  role: "user" | "assistant"
  content: string
  timestamp?: Date
  isLoading?: boolean
}

const ChatMessage: React.FC<ChatMessageProps> = ({ role, content, timestamp, isLoading }) => {
  const isUser = role === "user"

  // Simple markdown-like formatting
  const formatContent = (text: string) => {
    // Bold text
    text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    // Line breaks
    text = text.replace(/\n/g, "<br />")
    return text
  }

  return (
    <div className={`flex gap-3 mb-4 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      {/* Avatar */}
      <div className={`
        flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center
        ${isUser ? "bg-primary-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"}
      `}>
        {isUser ? (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
          </svg>
        )}
      </div>

      {/* Message bubble */}
      <div className={`
        max-w-[70%] rounded-2xl px-4 py-2
        ${isUser
          ? "bg-primary-600 text-white rounded-br-sm"
          : "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-sm"
        }
      `}>
        {isLoading ? (
          <div className="flex gap-1 items-center">
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></div>
            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></div>
          </div>
        ) : (
          <div
            className="text-sm leading-relaxed"
            dangerouslySetInnerHTML={{ __html: formatContent(content) }}
          />
        )}

        {timestamp && !isLoading && (
          <div className={`
            text-xs mt-1 opacity-70
            ${isUser ? "text-white" : "text-gray-500 dark:text-gray-400"}
          `}>
            {new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </div>
    </div>
  )
}

export default ChatMessage
