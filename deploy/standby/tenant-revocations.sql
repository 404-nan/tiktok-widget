-- Append-only encrypted tenant credential changes, independent of standby data snapshots.
CREATE TABLE IF NOT EXISTS tenant_revocations (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id TEXT NOT NULL,
  payload TEXT NOT NULL
);
