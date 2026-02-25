create table if not exists risk_assessments (
  id bigserial primary key,
  repo text not null,
  pr_number int not null,
  score int not null,
  severity text not null,
  findings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_risk_assessments_repo_pr
  on risk_assessments(repo, pr_number, created_at desc);
