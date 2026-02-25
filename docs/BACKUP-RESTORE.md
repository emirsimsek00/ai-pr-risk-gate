# Backup and Restore (Postgres)

## Backup

```bash
pg_dump "$DATABASE_URL" -Fc -f risk-gate-$(date +%Y%m%d-%H%M%S).dump
```

## Restore

```bash
createdb risk_gate_restore
pg_restore -d "$DATABASE_URL" --clean --if-exists risk-gate-YYYYMMDD-HHMMSS.dump
```

## Verify

```bash
psql "$DATABASE_URL" -c "select count(*) from risk_assessments;"
```
