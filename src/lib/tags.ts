/**
 * Tag names are comma-delimited on the wire in several places the DB never was:
 * the web task forms join/split them with `,`, and the tag filter query parameter
 * (`?tags=a,b`) does the same. Nothing stripped commas on the way in, so a name
 * containing one — trivially creatable from the Flutter editor, which only trims,
 * or via POST /api/v1/tasks — round-tripped as a single Tag row and then split
 * into two different tags the next time that task was saved from the web, silently
 * detaching the original and leaving it orphaned in the filter sidebar with zero
 * tasks. It was also permanently unfilterable for the same reason.
 *
 * Normalising at every write keeps the delimiter an implementation detail of the
 * transport rather than something a tag name can smuggle.
 */
export function normalizeTagName(raw: string): string {
  return raw.replace(/,/g, " ").replace(/\s+/g, " ").trim()
}
