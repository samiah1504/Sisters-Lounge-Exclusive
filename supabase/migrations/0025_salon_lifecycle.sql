-- ============================================================================
-- 0025 — SALON LIFECYCLE (v3 §7.3, edge cases #34–35)
-- Completes the status machine started by fn_pause_salon (0022):
-- launch (planned/waitlist → open), reopen (paused → open) and close
-- (open/paused → closed, releasing future reservations with
-- salon-cancelled semantics — no member penalty). All audited.
-- ============================================================================

create function public.fn_launch_salon(p_salon_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_salon public.salons;
begin
  if auth.uid() is not null and not public.has_permission('salons.manage') then
    raise exception 'permission denied: salons.manage';
  end if;
  select * into v_salon from public.salons where id = p_salon_id for update;
  if not found then raise exception 'salon not found'; end if;
  if v_salon.status not in ('planned', 'waitlist') then
    raise exception 'STATE: only a planned or waitlist salon can be launched';
  end if;

  update public.salons
     set status = 'open',
         launch_date = coalesce(launch_date, (now() at time zone 'Africa/Lagos')::date)
   where id = p_salon_id;

  -- A salon cannot open without hours and slot settings.
  insert into public.salon_hours (salon_id, day_of_week, is_open)
  select p_salon_id, d, d <> 0 from generate_series(0, 6) d
  on conflict do nothing;
  insert into public.salon_settings (salon_id) values (p_salon_id)
  on conflict do nothing;

  perform public.write_audit('salon.launched', 'salon', p_salon_id);
end $$;

create function public.fn_reopen_salon(p_salon_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_salon public.salons;
begin
  if auth.uid() is not null and not public.has_permission('salons.manage') then
    raise exception 'permission denied: salons.manage';
  end if;
  select * into v_salon from public.salons where id = p_salon_id for update;
  if not found then raise exception 'salon not found'; end if;
  if v_salon.status <> 'paused' then
    raise exception 'STATE: only a paused salon can be reopened';
  end if;
  update public.salons set status = 'open' where id = p_salon_id;
  perform public.write_audit('salon.reopened', 'salon', p_salon_id);
end $$;

-- Closing is permanent-ish (a closed salon can only be relaunched by hand);
-- like pause, it releases every future live visit at no member cost (#34).
create function public.fn_close_salon(p_salon_id uuid, p_reason text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_salon public.salons;
  v_released integer := 0;
  r record;
begin
  if auth.uid() is not null and not public.has_permission('salons.manage') then
    raise exception 'permission denied: salons.manage';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'REASON_REQUIRED: closing a salon needs a reason';
  end if;
  select * into v_salon from public.salons where id = p_salon_id for update;
  if not found then raise exception 'salon not found'; end if;
  if v_salon.status not in ('open', 'paused') then
    raise exception 'STATE: only an open or paused salon can be closed';
  end if;

  update public.salons set status = 'closed' where id = p_salon_id;

  for r in select id from public.appointments a
           where a.salon_id = p_salon_id
             and a.starts_at > now()
             and a.status = any (public.live_appointment_statuses())
  loop
    perform public.fn_release_appointment(r.id, 'cancelled_salon', p_reason);
    v_released := v_released + 1;
  end loop;

  perform public.write_audit('salon.closed', 'salon', p_salon_id, p_reason,
    jsonb_build_object('released_visits', v_released));

  return v_released;
end $$;
