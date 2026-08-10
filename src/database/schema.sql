-- Contacts Sync Table
CREATE TABLE IF NOT EXISTS contacts (
    jid TEXT PRIMARY KEY,
    phone TEXT,
    e164 TEXT,
    name TEXT,
    hash TEXT,
    isBusiness INTEGER,
    lastUpdated INTEGER,
    lastExported INTEGER
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_hash ON contacts(hash);

-- Export Auditing History Table
CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    export_date TEXT,
    export_time TEXT,
    duration_ms INTEGER,
    contacts_count INTEGER,
    file_size_bytes INTEGER,
    filename TEXT,
    cli_parameters TEXT,
    status TEXT
);
