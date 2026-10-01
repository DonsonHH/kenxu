# Private administration upgrade review

The existing repository/remote were reviewed before implementation. The base tests and production dependency audit passed. This change is restricted to private administration plus the necessary shared account/policy API behavior; the user website keeps its existing layout.

## Implemented features

| Before | After | Why |
| --- | --- | --- |
| Manual SSH terminal setup | Desktop launcher checks or starts a private, key-authenticated forwarding connection | One desktop entry without saving server passwords |
| Shared user/admin identity | Kenxu Control title, dark private sidebar and purple admin accents, including the login screen | Reduce confusion between account roles and endpoints |
| Only access grants editable | Username, display name, contact email, private note, subscription label, display allowance and optional expiry | Make ordinary-user administration useful without exposing secrets |
| Account aggregate usage only | Clickable user and node drilldowns, upload/download, today/month/lifetime and 30 daily records | Explain who used which logical route |
| Collector heartbeat cards only | Cached, allowlisted read-only monitoring cards | Reuse infrastructure telemetry while keeping monitor anti-framing headers intact |
| Read-only update policy | Validated persisted settings for title, intervals, display allowance, password floor, new session duration and monitor source/cache | Make controls functional without disabling fixed security boundaries |
| Latest 30 entries with a 500-row cap | Default 24-hour page, signed keyset continuation, fixed 30-day deletion and hourly maintenance | Lower request/resource cost and retain a clear time window |

The monitor data remains infrastructure data: its upload/download totals are the monitor's configured **current period**, not a friend's proxy counter. Portal route bytes remain a separate metric. The monitor URL and allowed origins are configured privately at deployment and are not repository defaults.

## Safety and verification

- Contact email is metadata only; no mail is sent. Administrator notes are not returned to the user's public interface.
- Display GB is not a transfer limit. Default values remain 100 GB, 720 minutes and 60-second website refresh unless changed deliberately.
- Optional expiry is an actual access policy. It is checked at login, session validation, subscription delivery and desired Xray client synchronization. Existing accounts are migrated with no expiry and unchanged credentials/grants.
- Changing a username invalidates the user's existing sessions/subscription link but retains the same internal ID and accounting identities/history.
- Settings reject invalid/unknown fields before writing. Strong-password changes apply to new or changed passwords; existing passwords still authenticate. Session-duration changes affect newly created sessions.
- Public user endpoints cannot access the private settings, audit, monitor or other-user detail routes.
- The monitor adapter reads only the public bootstrap path from a server-side allowed origin, refuses redirects, bounds the response to 1 MiB, normalizes selected fields and caches requests. It does not forward administrator cookies/tokens or expose raw source/IP/secret fields.
- Audit cleanup targets only audit records older than 30 days. The traffic ledger is not deleted. Continuation cursors are signed and anchored; repeat/new requests do not duplicate records across a page boundary. Previously removed legacy logs cannot be recreated.
- Async administration responses are guarded by session generation and modal request sequence. A late request must not overwrite another selected account/node or repopulate private widgets after logout.
- Node/usage/monitor operations are read-only. No VPS core, campus authentication, Cloudflare binding or monitor deployment was modified.
- Deployment retains a stopped-service private-data backup and the previous release before schema migration, settings initialization and release switching.

Thirteen backend tests and two isolated browser suites passed, including expanded profiles, optional expiry, settings validation, monthly metadata, shared-core attribution, default audit window/retention, bounded monitor data, role separation, all admin sections, detail dialogs, settings persistence, search, keyboard and 390px layout. Frontend/source syntax and dependency checks passed. Screenshots use fictional fixture accounts/monitor metrics, not real friend records.

## Desktop launcher boundary

The Node launcher uses a dedicated SSH key stored outside the repository and a ignored private SSH configuration. The installed key is source-restricted, does not allow shell/PTY/agent operations, and limits local forwarding to the administrator target. Key-based forwarding and rejection of shell/unapproved reverse forwarding were tested. The password is not stored. A loopback health/interface probe checks that the target is a private administrator endpoint before opening the browser.

The launcher can reuse an already healthy forwarding session; otherwise it starts a hidden SSH helper with bounded startup waiting. The website still requires an administrator login. It does not create/overwrite the administrator password. Diagnostic alternate-port helpers are closed after verification; the normal administrator tunnel remains for desktop use.

Initial PowerShell launcher execution resulted in the file being removed by the local environment. No security protection was disabled or excluded; the retained launcher is ordinary project Node source. The desktop shortcut target and private endpoint startup were separately verified. Machine-specific keys, host addresses, monitoring origin and live screenshots are excluded from Git.
