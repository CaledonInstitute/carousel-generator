ALTER TABLE instagram_connections ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'instagram_login';
ALTER TABLE instagram_connections ADD COLUMN client_business_id TEXT;
ALTER TABLE instagram_connections ADD COLUMN config_id TEXT;
