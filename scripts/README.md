# Scripts

| Script | Command | Purpose |
|---|---|---|
| `generate-data.js` | `npm run data:generate` | Creates the synthetic datasets. Skips if files exist; `-- --force` rebuilds them (Milestone 2, do not run on approved data) |
| `validate-data.js` | `npm run data:validate` | Read-only validation; separates intentional from unexpected findings |
| `import-data.js` | `npm run data:import` / `data:import:dry` / `data:emit-sql` | Loads the datasets into Supabase (or dry-run / seed SQL). See `docs/IMPORT_AND_REFRESH.md` |
| `test-import.js` | `npm run test:import` | 24 offline tests |
| `lib/` | - | CSV parser, transformation, import orchestration |
| `data-files.js` | - | Shared dataset path map |
