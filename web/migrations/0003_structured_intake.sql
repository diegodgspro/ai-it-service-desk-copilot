-- Backward-compatible optional metadata for incidents created through structured intake.
ALTER TABLE tickets ADD COLUMN origin TEXT NOT NULL DEFAULT 'existing';
ALTER TABLE tickets ADD COLUMN structured_intake TEXT;
