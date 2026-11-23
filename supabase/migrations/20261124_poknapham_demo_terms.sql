-- One-week trials use the same customer EXE and license endpoint as paid terms.
-- The seven-day clock starts only at the first successful activation.
create table if not exists public.pes_demo_terms (
  serial_hash text primary key check (serial_hash ~ '^[a-f0-9]{64}$'),
  customer_label text not null check (length(customer_label) between 1 and 120),
  device_code text check (device_code ~ '^[A-F0-9]{32}$'),
  created_at timestamptz not null default now(),
  activated_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  check ((activated_at is null and expires_at is null and device_code is null)
      or (activated_at is not null and expires_at is not null and device_code is not null
          and expires_at = activated_at + interval '7 days'))
);
alter table public.pes_demo_terms enable row level security;
revoke all on public.pes_demo_terms from public, anon, authenticated;
grant select, insert, update, delete on public.pes_demo_terms to service_role;

create or replace function public.pes_authorize(p_hash text, p_device text, p_activate boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.pes_customers%rowtype;
  t public.pes_terms%rowtype;
  demo public.pes_demo_terms%rowtype;
  started timestamptz;
begin
  if p_hash !~ '^[a-f0-9]{64}$' or p_device !~ '^[A-F0-9]{32}$' then
    return jsonb_build_object('active', false);
  end if;

  select * into demo from public.pes_demo_terms where serial_hash = p_hash for update;
  if found then
    if demo.revoked_at is not null then return jsonb_build_object('active', false); end if;
    if demo.activated_at is null then
      if not p_activate then return jsonb_build_object('active', false); end if;
      started := clock_timestamp();
      update public.pes_demo_terms
         set device_code = p_device, activated_at = started,
             expires_at = started + interval '7 days'
       where serial_hash = p_hash;
      demo.device_code := p_device;
      demo.activated_at := started;
      demo.expires_at := started + interval '7 days';
    end if;
    if demo.device_code <> p_device or clock_timestamp() >= demo.expires_at then
      return jsonb_build_object('active', false);
    end if;
    return jsonb_build_object('active', true, 'customer', demo.customer_label,
      'starts', demo.activated_at, 'expires', demo.expires_at, 'device', p_device,
      'kind', 'demo');
  end if;

  -- Existing paid 3 + 3 + 6 month entitlements remain unchanged.
  select * into t from public.pes_terms where serial_hash = p_hash;
  if not found then return jsonb_build_object('active', false); end if;
  select * into c from public.pes_customers where customer_id = t.customer_id for update;
  if t.revoked_at is not null or c.device_code is distinct from p_device and c.device_code is not null
     or (now() at time zone 'utc')::date < t.starts
     or (now() at time zone 'utc')::date >= t.expires then
    return jsonb_build_object('active', false);
  end if;
  if c.device_code is null then
    if not p_activate then return jsonb_build_object('active', false); end if;
    update public.pes_customers set device_code = p_device where customer_id = c.customer_id;
  end if;
  return jsonb_build_object('active', true, 'customer', c.customer_id,
    'starts', t.starts, 'expires', t.expires, 'device', p_device);
end $$;

revoke all on function public.pes_authorize(text,text,boolean) from public, anon, authenticated;
grant execute on function public.pes_authorize(text,text,boolean) to service_role;
