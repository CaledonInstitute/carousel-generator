ALTER TABLE instagram_slides RENAME COLUMN object_key TO upload_id;
CREATE TABLE instagram_media_chunks (
  upload_id TEXT NOT NULL,
  part INTEGER NOT NULL,
  data BLOB NOT NULL,
  expires INTEGER NOT NULL,
  PRIMARY KEY(upload_id, part)
);
CREATE INDEX instagram_media_expiry ON instagram_media_chunks(expires);
-- Old uploads cannot be resumed after switching storage.
UPDATE instagram_jobs SET status='failed', error='Penyimpanan media diperbarui. Siapkan posting kembali.' WHERE status IN ('preparing','queued','processing');
