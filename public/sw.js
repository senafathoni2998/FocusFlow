/* eslint-disable no-undef */
/**
 * FocusFlow service worker — background reminder delivery.
 *
 * Deliberately the smallest thing that can work. It does NOT cache anything, does
 * not intercept fetches, and does not try to make the app installable. A service
 * worker that caches is a service worker that can serve a stale build after a
 * deploy, and this app has no offline story on the web to justify that risk. Its
 * whole job is to be alive when the tab is not.
 *
 * Served from /public, so it is at the ORIGIN ROOT (/sw.js). That matters: a
 * worker's scope cannot be broader than its own path, and one at /_next/… could
 * never control the app.
 */

// A new worker replaces the old one immediately rather than waiting for every
// tab to close. Without this, a fix to this file could sit unapplied for as long
// as one pinned tab stayed open.
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", (event) => {
  // A push with no body, or a body that is not the JSON we send, still deserves
  // a notification: on most browsers a push event that shows nothing at all
  // counts against the origin's "budget" and can eventually revoke the
  // permission entirely.
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = {}
  }

  const title = data.title || "Task"
  const taskId = data.taskId || null
  // A test push is not a reminder, and heading it "FocusFlow reminder" would
  // teach the user to expect a task that is not there.
  const heading = data.type === "test" ? "FocusFlow" : "FocusFlow reminder"

  event.waitUntil(
    self.registration.showNotification(heading, {
      body: title,
      // No `icon` or `badge`: the app ships no icon asset, and naming one that
      // does not exist buys a 404 per notification in exchange for nothing. The
      // browser falls back to its own, which is honest. Add both here if an
      // icon is ever added to /public.
      //
      // Collapses repeats for the SAME task rather than stacking them. Keyed by
      // task, not by reminder, so a task with two reminders close together
      // leaves one notification rather than a pile.
      tag: taskId ? `task-${taskId}` : undefined,
      renotify: Boolean(taskId),
      data: { taskId },
      // Not `requireInteraction`: a reminder that will not go away until clicked
      // is an alarm, and nobody asked for an alarm.
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const taskId = event.notification.data && event.notification.data.taskId
  const url = taskId ? `/tasks?task=${encodeURIComponent(taskId)}` : "/tasks"

  event.waitUntil(
    // Focus an existing tab rather than opening a new one every time. Someone
    // who leaves the app open all day would otherwise collect a window per
    // reminder.
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(url).catch(() => {})
          return client.focus()
        }
      }
      return self.clients.openWindow(url)
    }),
  )
})
