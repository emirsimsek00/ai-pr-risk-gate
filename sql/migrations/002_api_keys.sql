create table if not exists api_keys (
  id bigserial primary key,
  token_hash text not null unique,
  role text not null check (role in ('read','write')),
  repos jsonb,
  owner_label text,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_keys_active
  on api_keys (token_hash, revoked_at, expires_at);
