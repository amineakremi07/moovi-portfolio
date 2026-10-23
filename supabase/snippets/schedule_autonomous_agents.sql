-- Schedule the Phase 4 agents (supabase/functions/autonomous-agents) every 10 minutes.
-- Not a migration on purpose: it needs secrets that must never be committed. Run it once in the SQL
-- editor AFTER the function is deployed and its secrets are set:
--
--   npx supabase secrets set AGENTS_SECRET=<32+ random chars> APP_URL=https://moovitn.vercel.app CRON_SECRET=<same as Vercel>
--   npx supabase functions deploy autonomous-agents --no-verify-jwt
--
-- Then replace <AGENTS_SECRET> below and run this file. Re-running it is safe (it replaces the job).

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Stored in Vault, read at each run: the cron command itself holds no secret.
select vault.create_secret('https://<your-project-ref>.supabase.co', 'agents_project_url')
 where not exists (select 1 from vault.secrets where name = 'agents_project_url');
select vault.create_secret('<AGENTS_SECRET>', 'agents_secret')
 where not exists (select 1 from vault.secrets where name = 'agents_secret');

select cron.unschedule('autonomous-agents') where exists (select 1 from cron.job where jobname = 'autonomous-agents');
select cron.schedule(
  'autonomous-agents',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'agents_project_url') || '/functions/v1/autonomous-agents',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-agents-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'agents_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $$
);

-- Check: select * from cron.job_run_details where jobid = (select jobid from cron.job where jobname = 'autonomous-agents') order by start_time desc limit 5;
--        select id, status_code, content from net._http_response order by created desc limit 5;
