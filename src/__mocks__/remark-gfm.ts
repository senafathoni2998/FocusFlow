/**
 * Test mock for remark-gfm (ESM, not transformed by Jest). It's only passed as
 * a plugin to the mocked react-markdown, so a no-op identity transform is enough.
 */
export default function remarkGfm() {
  return (tree: unknown) => tree
}
