-- ============================================================
--  EL DESPERTADOR DEL SYNC
--  Supabase llama a GitHub a la hora exacta; GitHub corre el sync.
--  Pégalo en: Supabase → SQL Editor → New query → Run
-- ============================================================
--
--  POR QUE EXISTE ESTO
--
--  El horario propio de GitHub (.github/workflows/sync.yml) no se cumple.
--  Las tareas programadas de las cuentas gratuitas caen en una cola comun y
--  GitHub las suelta cuando le sobran maquinas: medido entre el 21 de
--  septiembre y el 2 de octubre de 2026, llegaban entre 2 y 6 horas tarde y
--  una de las cuatro se perdia entera casi todos los dias. Mover el minuto
--  fuera de la hora en punto (:05 -> :37) no cambio nada.
--
--  La cola solo afecta al EVENTO "schedule". Una llamada a la API —la misma
--  que usa el boton "Run workflow"— arranca al momento. Asi que la hora la
--  pone Supabase, que si es puntual, y el trabajo lo sigue haciendo GitHub.
--  El sync no se toca: ni una linea de sync.js cambia.
--
--  El horario viejo de GitHub se queda puesto como red de seguridad. Si un
--  dia Supabase falla, la corrida tardona de GitHub igual entra. Que corran
--  las dos no duplica nada: cada sync recalcula todo desde cero.
--
--  ESTO NO TOCA NADA DE LO QUE YA HAY: ni la tabla leads, ni kv, ni las
--  politicas RLS, ni el trigger guardia_leads. Solo añade.
-- ============================================================


-- ---------- 1. LAS DOS PIEZAS QUE HACEN FALTA ----------
-- pg_cron = el reloj.  pg_net = la llamada por internet.
-- (Tambien se pueden encender en Database → Extensions.)

create extension if not exists pg_cron;
create extension if not exists pg_net;


-- ---------- 2. GUARDAR LA LLAVE DE GITHUB ----------
-- Va en el Vault de Supabase: queda cifrada y no se ve en texto plano
-- ni volviendo a abrir esta consulta.
--
-- Sustituye PEGA_AQUI_EL_TOKEN por el token de GitHub (empieza por
-- "github_pat_"). Corre esta linea UNA sola vez.

select vault.create_secret(
  'PEGA_AQUI_EL_TOKEN',
  'github_sync_token',
  'Token para que Supabase despierte al robot del sync en GitHub'
);


-- ---------- 3. EL HORARIO ----------
-- pg_cron trabaja en UTC. Puerto Rico es UTC-4 todo el año (no hay
-- cambio de hora), asi que:
--
--      11:00 UTC  =   7:00 am
--      16:00 UTC  =  12:00 pm
--      20:00 UTC  =   4:00 pm
--      00:00 UTC  =   8:00 pm
--
-- Para cambiar las horas: cambia la lista "11,16,20,0" y vuelve a correr
-- este bloque entero (cron.schedule con el mismo nombre lo reemplaza).

select cron.schedule(
  'despertar-sync',
  '0 11,16,20,0 * * *',
  $$
  select net.http_post(
    url     := 'https://api.github.com/repos/blitz-advertising/blitz-website/actions/workflows/sync.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret
                                       from vault.decrypted_secrets
                                      where name = 'github_sync_token'),
      'Accept',        'application/vnd.github+json',
      'Content-Type',  'application/json',
      -- GitHub rechaza las llamadas sin User-Agent. No es opcional.
      'User-Agent',    'supabase-cron-blitz'
    ),
    body    := jsonb_build_object('ref', 'main')
  );
  $$
);


-- ============================================================
--  COMPROBAR QUE FUNCIONA
-- ============================================================

-- A) Dispararlo AHORA, sin esperar a la hora. Corre esto y luego mira
--    github.com/blitz-advertising/blitz-website/actions: debe aparecer
--    una corrida nueva en segundos, marcada "workflow_dispatch".

select net.http_post(
  url     := 'https://api.github.com/repos/blitz-advertising/blitz-website/actions/workflows/sync.yml/dispatches',
  headers := jsonb_build_object(
    'Authorization', 'Bearer ' || (select decrypted_secret
                                     from vault.decrypted_secrets
                                    where name = 'github_sync_token'),
    'Accept',        'application/vnd.github+json',
    'Content-Type',  'application/json',
    'User-Agent',    'supabase-cron-blitz'
  ),
  body    := jsonb_build_object('ref', 'main')
);


-- B) Que contesto GitHub.
--    204 = perfecto (GitHub acepta y no devuelve nada).
--    401 = el token esta mal o caduco.
--    403 = al token le falta el permiso "Actions: Read and write".
--    404 = el nombre del repo o del workflow no cuadra.

select id, status_code, content, created
  from net._http_response
 order by created desc
 limit 5;


-- C) Historial del despertador: cada vez que el reloj hizo su trabajo.

select jobid, runid, status, return_message, start_time
  from cron.job_run_details
 order by start_time desc
 limit 10;


-- D) Ver el horario que hay puesto ahora mismo.

select jobname, schedule, active from cron.job;


-- ============================================================
--  SI ALGUN DIA HAY QUE DESMONTARLO
-- ============================================================
--
--    select cron.unschedule('despertar-sync');
--
--  Y para cambiar el token cuando caduque (los de GitHub caducan;
--  apunta la fecha): borrar el viejo y crear uno nuevo con el MISMO
--  nombre, que es por donde lo busca el horario.
--
--    delete from vault.secrets where name = 'github_sync_token';
--    select vault.create_secret('TOKEN_NUEVO', 'github_sync_token',
--             'Token para que Supabase despierte al robot del sync');
-- ============================================================
