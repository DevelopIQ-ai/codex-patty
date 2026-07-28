# Security boundary

The daemon refuses non-loopback binds. Treat the local Patty key as a password: it is returned only when issued and should be placed in an OS keyring (or an owner-only local file for headless systems). Do not place it in shell history.

SQLite stores no prompt, output, email, upstream ID, OAuth token, refresh token, cookie, or Codex auth file. Logs should be allowlisted metadata only. Account aliases are opaque. The Codex adapter must only be used against a pinned, operator-verified official binary and documented schemas.
