# Keeping lists manageable

Growing lists use six items per page, Previous/Next buttons, item counts and page counts. Small lists do not show pagination controls. Page numbers reset when switching care recipients or inbox categories; when a list shrinks, its visible page is clamped to an available page.

## Coverage

- Notifications: inbox and delivery attempts, with separate Remove, Clear all and Restore controls.
- Overview: care risks; the existing short schedule preview remains compact.
- Handover: support contacts, care circle, and changes since the last handover.
- Care plan: reusable plan templates.
- Responsibilities: task list, retaining Complete and Archive actions.
- Activity log: events, retaining the audit trail.
- Trusted facts: fact cards and conflicting fact groups, retaining verification and archive controls.
- Care circle: members and invitations.
- Evaluations: execution traces.
- Care Organizer: assigned and available tasks, coverage requests, reviewable plans, availability, daily tasks, routines, urgent attention and routine updates.
- Calendar: approval proposals, appointments and confirmed action history.
- Mobile shares the responsive dashboard, including the same search, filters, pagination and notification visibility controls.

Dropdown choices, small fixed metrics, appointment selection, and the seven-day calendar remain in their existing layouts. Chat already has a bounded scrolling panel, so it keeps conversation order without numbered pages. Existing provider/planning API result limits still apply; pagination is over records returned by each endpoint. Notification inbox and delivery history no longer stop at 30 records.

## Notification categories

All, Needs attention, Care updates, Unread and Read show counts. Needs attention includes pending approvals, risk notices, failed deliveries and unknown/sending deliveries. All puts these first, preserving their relative order. Reading an important notice does not remove it from Needs attention. Provider acceptance is labeled separately from confirmed delivery.

Inbox removal is scoped to the signed-in member. Clear all preserves pending approvals and never deletes care tasks or the delivery records used to prevent duplicate sends. Restore brings back retained inbox entries. Delivery history has its own independent visibility controls. Export includes visibility preferences; recipient deletion and retention clean them up.

## Search and filters

All paginated lists receive their source records so filtering happens before pagination. Search matches display text (titles, messages, names, owners, sources, categories, and proposal details), not credentials or hidden destinations. Lists with multiple records show search plus up to three relevant facets when there are different values: status, category, owner, channel, severity, priority, type, role, source, or relationship. Needs attention filters show up for pending/blocked/failed/unconfirmed work, open risk notices, important contacts and overdue incomplete tasks. They never classify completed or archived work as overdue. Inbox attention categories remain independently available.

Search and facets combine; Clear filters restores the full returned list. The match count and no-results state stay visible, and changing filters returns to the first page. Filters reset on care-recipient changes. The same controls apply to mobile lists.

Activity log and trusted-fact filters separate Source from Contributor. Legacy source values that exactly match a current care-circle display name appear under Contributor; other values remain under Source. Original records are preserved. Unrecognized historical names remain unchanged because the legacy field does not carry a contributor ID. Each filter also remains available when a single value can narrow a mixed list.
