-- MAJA Invites — seed 6 starter accounts into a fresh DB.
-- Storage model: every collection is a table (id text PK, data jsonb).
-- Passwords are bcrypt ($2b$) — the hashes below decode to the plaintext noted.
-- Idempotent: each row is guarded by "WHERE NOT EXISTS ... email".
--
-- Run inside the postgres (`db`) container:
--   docker compose -f docker-compose.yml -f docker-compose.deploy.yml \
--     exec -T db psql -U maja -d maja -f - < db/seed_accounts.sql
-- (or paste into:  docker compose ... exec db psql -U maja -d maja )
--
-- Plaintext logins:
--   admin1@majainvites.com / Admin@1234    (super_admin  → /super-admin)
--   admin2@majainvites.com / Admin@1234    (super_admin  → /super-admin)
--   studio1@majainvites.com / Studio@1234  (photographer → /studio)
--   studio2@majainvites.com / Studio@1234  (photographer → /studio)
--   user1@majainvites.com  / User@1234     (normal user  → home Sign in)
--   user2@majainvites.com  / User@1234     (normal user  → home Sign in)
-- CHANGE THESE PASSWORDS after first login.

-- ── ADMINS (Super-Admin panel) ─────────────────────────────────────────────
INSERT INTO admins (id, data)
SELECT '11111111-1111-4111-8111-111111111111',
'{"id":"11111111-1111-4111-8111-111111111111","email":"admin1@majainvites.com","username":"admin1","name":"Admin One","password_hash":"$2b$12$.ROwsdmYlri3mv/S6eAMlu3FvMwhVAFPrVv1ROCj7YO8lotkkryDK","role":"super_admin","status":"active","is_suspended":false,"is_verified":true,"email_verified":true,"phone_verified":true,"self_signup":false,"created_by":null,"created_at":"2026-07-10T00:00:00+00:00","updated_at":"2026-07-10T00:00:00+00:00"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM admins WHERE data->>'email' = 'admin1@majainvites.com');

INSERT INTO admins (id, data)
SELECT '22222222-2222-4222-8222-222222222222',
'{"id":"22222222-2222-4222-8222-222222222222","email":"admin2@majainvites.com","username":"admin2","name":"Admin Two","password_hash":"$2b$12$.ROwsdmYlri3mv/S6eAMlu3FvMwhVAFPrVv1ROCj7YO8lotkkryDK","role":"super_admin","status":"active","is_suspended":false,"is_verified":true,"email_verified":true,"phone_verified":true,"self_signup":false,"created_by":null,"created_at":"2026-07-10T00:00:00+00:00","updated_at":"2026-07-10T00:00:00+00:00"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM admins WHERE data->>'email' = 'admin2@majainvites.com');

-- ── PHOTOGRAPHERS (Studio panel — same table, role="admin") ────────────────
INSERT INTO admins (id, data)
SELECT '33333333-3333-4333-8333-333333333333',
'{"id":"33333333-3333-4333-8333-333333333333","email":"studio1@majainvites.com","username":"studio1","name":"Studio One","business_name":"Studio One","password_hash":"$2b$12$Y0CItE1VgX50vBh1WgTpmuaSp4mvtvuMIkJMiz8xWePh3yjvX8GyW","role":"admin","status":"active","is_suspended":false,"is_verified":true,"email_verified":true,"phone_verified":true,"self_signup":false,"created_by":null,"created_at":"2026-07-10T00:00:00+00:00","updated_at":"2026-07-10T00:00:00+00:00"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM admins WHERE data->>'email' = 'studio1@majainvites.com');

INSERT INTO admins (id, data)
SELECT '44444444-4444-4444-8444-444444444444',
'{"id":"44444444-4444-4444-8444-444444444444","email":"studio2@majainvites.com","username":"studio2","name":"Studio Two","business_name":"Studio Two","password_hash":"$2b$12$Y0CItE1VgX50vBh1WgTpmuaSp4mvtvuMIkJMiz8xWePh3yjvX8GyW","role":"admin","status":"active","is_suspended":false,"is_verified":true,"email_verified":true,"phone_verified":true,"self_signup":false,"created_by":null,"created_at":"2026-07-10T00:00:00+00:00","updated_at":"2026-07-10T00:00:00+00:00"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM admins WHERE data->>'email' = 'studio2@majainvites.com');

-- ── NORMAL USERS ───────────────────────────────────────────────────────────
INSERT INTO users (id, data)
SELECT '55555555-5555-4555-8555-555555555555',
'{"id":"55555555-5555-4555-8555-555555555555","user_id":"user_a1b2c3d4e5f6","email":"user1@majainvites.com","name":"User One","phone":"+919999900001","picture":null,"password_hash":"$2b$12$0Fo1dJpwSBC.1BudSK7go.40aLeninRuG91ALPdwu6jbvNCygwve2","auth_provider":"password","is_verified":true,"email_verified":true,"phone_verified":true,"created_at":"2026-07-10T00:00:00+00:00","updated_at":"2026-07-10T00:00:00+00:00"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM users WHERE data->>'email' = 'user1@majainvites.com');

INSERT INTO users (id, data)
SELECT '66666666-6666-4666-8666-666666666666',
'{"id":"66666666-6666-4666-8666-666666666666","user_id":"user_f6e5d4c3b2a1","email":"user2@majainvites.com","name":"User Two","phone":"+919999900002","picture":null,"password_hash":"$2b$12$0Fo1dJpwSBC.1BudSK7go.40aLeninRuG91ALPdwu6jbvNCygwve2","auth_provider":"password","is_verified":true,"email_verified":true,"phone_verified":true,"created_at":"2026-07-10T00:00:00+00:00","updated_at":"2026-07-10T00:00:00+00:00"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM users WHERE data->>'email' = 'user2@majainvites.com');
