-- سكون reminders: run ONCE in Supabase -> SQL Editor -> New query -> Run.
-- Every minute, Supabase asks the app to send any reminders that are due (timer ended, wind-down, daily check-in).
-- The call carries no data and is safe to repeat; the app only sends what is due, once.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- remove an older copy of this job if you run the script again
select cron.unschedule(jobid) from cron.job where jobname = 'sukoon-reminders';

select cron.schedule(
  'sukoon-reminders',
  '* * * * *',
  $$ select net.http_post(
       url     := 'https://pause-gamma.vercel.app/api/push',
       body    := '{"action":"tick"}'::jsonb,
       headers := '{"Content-Type":"application/json"}'::jsonb
     ); $$
);

-- To check it's running:   select * from cron.job_run_details order by start_time desc limit 5;
-- To turn reminders off:   select cron.unschedule('sukoon-reminders');
