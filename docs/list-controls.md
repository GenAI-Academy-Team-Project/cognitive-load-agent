# List controls

Lists search and filter the complete loaded collection before pagination. Each list owns its filters and page, starts over when the recipient changes, and moves back to a valid page when removals empty the last page. The default page size is six; compact handover columns use three. Record caps in notifications, delivery history, planning proposals, calendar actions, and chat were removed so older records are reachable.

**Remove** affects one record. **Clear all (N)** confirms the count and includes all eligible records across pages, including records excluded by the current filters. **Clear filters** only resets search and filters. The confirmation describes the effect before making changes. Errors keep the confirmation open; protected records stay available.

| Screens / lists | Removal behavior |
| --- | --- |
| Responsibilities, organizer task lists, upcoming schedule | Archive shared responsibilities. This does not cancel a connected Google appointment. |
| Trusted facts, fact details | Archive shared facts; archived facts are excluded from current memory retrieval. |
| Support contacts | Archive shared contacts. |
| Care circle and handover care team | Remove recipient access for non-owner members; owners are protected. |
| Recurring care | Stop repeating routines; already-created responsibilities remain. |
| Availability | Remove only the signed-in caregiver's windows. |
| Reviewable plans | Reject pending proposals and dismiss the selected history from the caregiver's view. |
| Coverage requests | Decline requests waiting for the signed-in caregiver using the existing planning action. |
| Notifications, urgent updates, routine digest | Dismiss from the caregiver's inbox; retain delivery records and approval state. |
| Activity, evaluations, risk cards, plan templates | Dismiss from the caregiver's view; retain shared evidence, risk evaluation, and templates. |
| Delivery history and confirmed calendar history | Dismiss history from the caregiver's view. |
| Chat history | Dismiss messages with no pending action; unresolved approvals remain reviewable. Most recent messages appear first. |
| Calendar proposals | Discard pending/failed proposals; executing or uncertain results remain reviewable. |
| Care appointments | Prepare cancellation proposals for appointments the caregiver manages. Each still requires approval before Google is changed or guests are notified. |
| Integrations | Switch off enabled services. Credentials and provider data remain. |
| Notification drafts | Discard unsent drafts using the existing rejection action. |

Handover changes, open-risk summaries, verification summaries, and conflicting-fact lists are searchable and paginated. Handover acknowledgement and fact verification retain their explicit workflow controls; clearing a list does not silently acknowledge a handover or resolve conflicting facts. Static role explanations, metrics, calendar day grids, and form options are not record-deletion lists.

Personal dismissals are stored by recipient, caregiver, record type, and record ID. The API verifies recipient access and every requested ID before mutation, rejects unauthorized shared changes, and preserves audit entries. Recipient deletion also removes dismissal metadata.

## Notification composer

Notifications includes a custom-message form and editable care check-in, appointment reminder, coverage request, and handover templates. Choose an active care-circle member and an available channel, prepare the message, review its exact text, and explicitly approve delivery. Pending drafts survive reload and can be discarded individually or together. External provider configuration, recipient opt-in, and delivery checks use the existing notification service.

Inbox cards show distinct labels, icons, and tones for approval requests, care risks, reminders, and system updates. Delivery status and unread state remain separate from notification type.
