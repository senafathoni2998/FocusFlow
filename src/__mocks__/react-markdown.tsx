import React from "react"

/**
 * Test mock for react-markdown (which ships as ESM and isn't transformed by
 * Jest). Renders the markdown source as-is so component tests can assert that
 * content reaches the renderer, without pulling in the real ESM dependency tree.
 * Actual markdown-to-HTML rendering is react-markdown's own (well-tested) job.
 */
export default function ReactMarkdown({
  children,
}: {
  children?: React.ReactNode
  [key: string]: unknown
}) {
  return <div>{children}</div>
}
