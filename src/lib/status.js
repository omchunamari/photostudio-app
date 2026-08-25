/**
 * Single source of truth for what counts as "past" vs "active" for
 * projects and events. Both share the same status vocabulary
 * (PROJECT_STATUSES from lib/constants/projects.js — events reuse it
 * directly, there's no separate event-status list), so one definition
 * covers both.
 *
 * Anything at "Delivered" or "Archived" is done — the shoot happened,
 * the work is out the door. Everything before that is still active.
 *
 * Used to:
 *  - split "My Projects" / admin "Projects" into Active / Past tabs
 *  - grey out / collapse past items on the Calendar
 *  - exclude past events from Team Load (current workload), while
 *    leaving Employee Value / P&L untouched (those need full history)
 */
export const PAST_STATUSES = ["Delivered", "Archived"];

export function isProjectPast(project) {
  return PAST_STATUSES.includes(project?.status);
}

export function isEventPast(event) {
  return PAST_STATUSES.includes(event?.status);
}