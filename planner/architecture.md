# Personal Planner MVP
Separate installable desktop-first web app with responsive mobile quick capture. Keep existing health app and its records unchanged. Free-tier only. No paid APIs.
## Records
Task: UUID, title, optional notes/project/deadline, status (inbox,next,scheduled,waiting,delegated,done,archived), optional estimate range, optional demand ratings (cognitive,creative,emotional,physical,executive), createdAt, updatedAt, revision.
Activity observation: source, capture timestamp, date, title, optional start/end/duration, confidence, source identifier if available. Unknown completion stays null. Immutable observations are not actual workload.
Work session: task ID optional, start/end, interruptions optional, actual minutes optional, user-confirmed completion, optional perceived impact.
Project: UUID, title, status. Follow-up: task ID, optional review date.
## Sync
Separate authenticated planner endpoints and storage namespace. Owner-only access; separate planner read/write scopes for assistant, no implicit health write access. Extension sends only normalized records, never raw page text or profile IDs. Explicit opt-in for work/calendar data. Validate size, schema and timestamps; reject malformed/truncated snapshots. Deduplicate identical observations; do not infer identity from title alone or deletion from absence. Keep stale/partial coverage visible. Manual task writes use revision checks and idempotency keys. Offline queue retries without duplicating tasks.
## UI
Today, Inbox, Tasks, Projects, Waiting and Delegated as views of one dashboard. Mobile quick capture works independently of desktop. No mandatory duration or demand ratings. Show last sync and source confidence. Capacity suggestions use read-only summaries from Personal OS with owner consent, never assume missing health data means normal capacity. Separate planned, actual and experienced workload. No automatic rollover or scheduling without approval.
## Release gates
Test parser against synthetic fixtures and privately supplied reports; no private reports in public GitHub. Test date rollover, scroll, zoom, duplicate names, missing entries and offline retries. Verify authorization, cross-device sync and backup/export before enabling automatic upload. Deploy separately from existing health app.
