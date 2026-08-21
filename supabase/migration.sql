-- ============================================================================
-- Indizilla platform schema — paste this whole file into the Supabase
-- SQL Editor (https://supabase.com/dashboard/project/iykuvppjmmatsvrrtwra/sql)
-- and press RUN. Safe to re-run: everything is idempotent.
-- ============================================================================

-- ---------------------------------------------------------------- profiles

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  name          text default '',
  business      text default '',
  picture       text default '',
  referral_code text unique,
  is_admin      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Super admins, enforced at the database level.
create or replace function public.admin_email_list()
returns text[] language sql immutable as
$$ select array['ashishnarayan9110@gmail.com','ancor.yen@gmail.com'] $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, picture, is_admin)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email,''), '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    lower(coalesce(new.email,'')) = any (public.admin_email_list())
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep admin flags correct for accounts that signed up before this migration.
update public.profiles set is_admin = true where lower(email) = any (public.admin_email_list());

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false) $$;

-- ----------------------------------------------------------------- coupons

create table if not exists public.coupons (
  code         text primary key,
  type         text not null check (type in ('percent','flat')),
  value        integer not null,
  max_discount integer,
  min_amount   integer not null default 0,
  active       boolean not null default true,
  descr        text not null default ''
);

insert into public.coupons (code, type, value, max_discount, min_amount, active, descr) values
  ('WELCOME10',  'percent', 10, 1000, 0,     true, '10% off your first order (up to ₹1,000)'),
  ('NEWSITE500', 'flat',    500, null, 5000, true, '₹500 off any order of ₹5,000 or more'),
  ('GROWTH15',   'percent', 15, 3000, 10000, true, '15% off orders of ₹10,000+ (up to ₹3,000)')
on conflict (code) do nothing;

-- ------------------------------------------------------------------ orders

create table if not exists public.orders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  service_id   text not null,
  service_name text not null,
  amount       integer not null,
  discount     integer not null default 0,
  coupon_code  text,
  credits_used integer not null default 0,
  payable      integer not null,
  payment_id   text,
  method       text not null default 'razorpay',
  status       text not null default 'paid',
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------------- jobs

create table if not exists public.jobs (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  service_name text not null,
  status       text not null default 'queued' check (status in ('queued','in-progress','review','delivered')),
  due_at       timestamptz not null,
  issues       jsonb not null default '[]',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------------------------- bills

create sequence if not exists public.bill_seq start 1001;

create table if not exists public.bills (
  id           uuid primary key default gen_random_uuid(),
  number       text unique not null,
  order_id     uuid not null references public.orders(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  date         timestamptz not null default now(),
  items        jsonb not null default '[]',
  discount     integer not null default 0,
  coupon_code  text,
  credits_used integer not null default 0,
  total        integer not null,
  payment_id   text,
  method       text not null default 'razorpay',
  status       text not null default 'paid'
);

-- ----------------------------------------------------------- credit ledger

create table if not exists public.credit_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  amount     integer not null,
  reason     text not null default '',
  created_at timestamptz not null default now()
);

-- --------------------------------------------------------------- referrals

create table if not exists public.referrals (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references public.profiles(id) on delete cascade,
  new_user_id   uuid not null unique references public.profiles(id) on delete cascade,
  new_user_name text not null default '',
  quarter       text not null,
  credited      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ------------------------------------------- order trigger: job + bill + credits

create or replace function public.service_timeline_days(sid text)
returns integer language sql immutable as $$
  select case sid
    when 'gbp' then 3            when 'brand' then 14
    when 'website' then 21       when 'landing' then 7
    when 'seo' then 14           when 'meta-ads' then 7
    when 'google-ads' then 7     when 'crm' then 7
    when 'email' then 1          when 'chatbot' then 7
    when 'automation' then 7     when 'social' then 7
    when 'maintenance' then 3    when 'reviews' then 3
    when 'profile-design' then 2 when 'catalogue' then 5
    when 'whatsapp' then 2       when 'booking' then 4
    when 'tier-starter' then 7   when 'tier-growth' then 21
    when 'tier-partner' then 7   else 14 end
$$;

create or replace function public.handle_new_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.jobs (order_id, user_id, service_name, due_at)
  values (new.id, new.user_id, new.service_name,
          new.created_at + make_interval(days => public.service_timeline_days(new.service_id)));

  insert into public.bills (number, order_id, user_id, date, items, discount, coupon_code, credits_used, total, payment_id, method)
  values ('INV-' || extract(year from new.created_at)::text || '-' || nextval('public.bill_seq')::text,
          new.id, new.user_id, new.created_at,
          jsonb_build_array(jsonb_build_object('label', new.service_name, 'amount', new.amount)),
          new.discount, new.coupon_code, new.credits_used, new.payable, new.payment_id, new.method);

  if new.credits_used > 0 then
    insert into public.credit_ledger (user_id, amount, reason)
    values (new.user_id, -new.credits_used, 'Redeemed on ' || new.service_name);
  end if;

  return new;
end $$;

drop trigger if exists on_order_created on public.orders;
create trigger on_order_created
  after insert on public.orders
  for each row execute function public.handle_new_order();

-- -------------------------------------------------------------------- RPCs

-- Credit balance helper.
create or replace function public.credit_balance(uid uuid)
returns integer language sql stable security definer set search_path = public as
$$ select coalesce(sum(amount), 0)::integer from public.credit_ledger where user_id = uid $$;

-- Place an order. Coupon and credits are re-validated server-side so the
-- client can never invent a discount.
create or replace function public.place_order(
  p_service_id text, p_service_name text, p_amount integer,
  p_coupon_code text default null, p_use_credits boolean default false,
  p_payment_id text default null, p_method text default 'razorpay'
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_discount integer := 0;
  v_coupon public.coupons;
  v_credits integer := 0;
  v_payable integer;
  v_order public.orders;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Bad amount'; end if;

  if p_coupon_code is not null and length(trim(p_coupon_code)) > 0 then
    select * into v_coupon from public.coupons
      where code = upper(trim(p_coupon_code)) and active = true;
    if found and p_amount >= v_coupon.min_amount then
      v_discount := case when v_coupon.type = 'percent'
                         then round(p_amount * v_coupon.value / 100.0)::integer
                         else v_coupon.value end;
      if v_coupon.max_discount is not null then
        v_discount := least(v_discount, v_coupon.max_discount);
      end if;
      v_discount := least(v_discount, p_amount);
    else
      v_discount := 0;
    end if;
  end if;

  if p_use_credits then
    v_credits := least(public.credit_balance(v_uid), p_amount - v_discount);
    if v_credits < 0 then v_credits := 0; end if;
  end if;

  v_payable := p_amount - v_discount - v_credits;

  insert into public.orders (user_id, service_id, service_name, amount, discount,
                             coupon_code, credits_used, payable, payment_id, method)
  values (v_uid, p_service_id, p_service_name, p_amount, v_discount,
          case when v_discount > 0 then upper(trim(p_coupon_code)) else null end,
          v_credits, v_payable, p_payment_id, p_method)
  returning * into v_order;

  return v_order;
end $$;

-- Redeem a referral code, once, for the signed-in (new) account.
-- ₹500 credit to the owner, capped at 3 credited referrals per quarter.
create or replace function public.redeem_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_owner public.profiles;
  v_quarter text := extract(year from now())::text || '-Q' || (floor((extract(month from now()) - 1) / 3) + 1)::text;
  v_credited boolean;
  v_name text;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  select * into v_owner from public.profiles where referral_code = upper(trim(p_code));
  if not found then return jsonb_build_object('ok', false, 'error', 'Referral code not recognised.'); end if;
  if v_owner.id = v_uid then return jsonb_build_object('ok', false, 'error', 'You can''t refer yourself.'); end if;
  if exists (select 1 from public.referrals where new_user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'This account was already referred.');
  end if;

  v_credited := (select count(*) from public.referrals
                 where owner_id = v_owner.id and quarter = v_quarter and credited) < 3;
  select name into v_name from public.profiles where id = v_uid;

  insert into public.referrals (owner_id, new_user_id, new_user_name, quarter, credited)
  values (v_owner.id, v_uid, coalesce(v_name, ''), v_quarter, v_credited);

  if v_credited then
    insert into public.credit_ledger (user_id, amount, reason)
    values (v_owner.id, 500, 'Referral bonus — ' || coalesce(v_name, 'new client'));
  end if;

  return jsonb_build_object('ok', true, 'credited', v_credited);
end $$;

-- Generate (once) and return the caller's referral code. Only clients with at
-- least one order get a code.
create or replace function public.my_referral_code()
returns text language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.orders where user_id = v_uid) then return null; end if;
  select referral_code into v_code from public.profiles where id = v_uid;
  if v_code is null then
    loop
      v_code := 'INDI-' || upper(substr(md5(random()::text), 1, 4));
      begin
        update public.profiles set referral_code = v_code where id = v_uid;
        exit;
      exception when unique_violation then
        -- rare collision: try another code
      end;
    end loop;
  end if;
  return v_code;
end $$;

-- Admin: adjust any user's credits.
create or replace function public.admin_adjust_credits(p_user_id uuid, p_amount integer, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  insert into public.credit_ledger (user_id, amount, reason)
  values (p_user_id, p_amount, coalesce(p_reason, 'Adjustment by admin'));
end $$;

-- --------------------------------------------------------------------- RLS

alter table public.profiles      enable row level security;
alter table public.coupons       enable row level security;
alter table public.orders        enable row level security;
alter table public.jobs          enable row level security;
alter table public.bills         enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.referrals     enable row level security;

-- profiles
drop policy if exists "profiles self read"   on public.profiles;
drop policy if exists "profiles self update" on public.profiles;
drop policy if exists "profiles admin all"   on public.profiles;
create policy "profiles self read"   on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles self update" on public.profiles for update
  using (id = auth.uid() or public.is_admin())
  with check ((id = auth.uid() and is_admin = (select p.is_admin from public.profiles p where p.id = auth.uid())) or public.is_admin());

-- coupons: everyone can read active codes; admins manage them
drop policy if exists "coupons read active" on public.coupons;
drop policy if exists "coupons admin write" on public.coupons;
create policy "coupons read active" on public.coupons for select using (active = true or public.is_admin());
create policy "coupons admin write" on public.coupons for all
  using (public.is_admin()) with check (public.is_admin());

-- orders / bills / credit_ledger / referrals: own rows or admin (writes go through RPCs)
drop policy if exists "orders read"    on public.orders;
create policy "orders read"    on public.orders        for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "bills read"     on public.bills;
create policy "bills read"     on public.bills         for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "ledger read"    on public.credit_ledger;
create policy "ledger read"    on public.credit_ledger for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists "referrals read" on public.referrals;
create policy "referrals read" on public.referrals     for select using (owner_id = auth.uid() or new_user_id = auth.uid() or public.is_admin());

-- jobs: clients see their own; admins see and edit everything
drop policy if exists "jobs read"         on public.jobs;
drop policy if exists "jobs admin update" on public.jobs;
create policy "jobs read"         on public.jobs for select using (user_id = auth.uid() or public.is_admin());
create policy "jobs admin update" on public.jobs for update
  using (public.is_admin()) with check (public.is_admin());

-- Belt and braces: no direct table writes from the browser.
revoke insert, update, delete on public.orders, public.bills, public.credit_ledger, public.referrals from anon, authenticated;
grant  update on public.jobs to authenticated;          -- RLS restricts this to admins
grant  insert, update, delete on public.coupons to authenticated; -- RLS restricts to admins
grant  update on public.profiles to authenticated;      -- RLS restricts to self/admin

-- Done. Tables, triggers, RPCs and policies are in place.


-- ============================================================================
-- Indizilla Research — AI-simulated market research (studies, personas, memos)
-- Study credits are a SEPARATE currency from the ₹ referral credit_ledger above.
-- Prices and mode costs live server-side so the browser can never spoof them.
-- Everything below is idempotent — safe to re-run with the rest of this file.
-- ============================================================================

-- ------------------------------------------------------- research credit packs
create table if not exists public.research_packs (
  id        text primary key,
  name      text not null,
  price_inr integer not null,          -- whole rupees charged via Razorpay
  credits   integer not null,          -- study credits granted
  popular   boolean not null default false,
  active    boolean not null default true,
  sort      integer not null default 0
);

insert into public.research_packs (id, name, price_inr, credits, popular, sort) values
  ('starter', 'Starter', 399,  450,  false, 1),
  ('growth',  'Growth',  899,  1050, true,  2),
  ('pro',     'Pro',     1499, 1900, false, 3)
on conflict (id) do nothing;

-- Study modes: respondents + credit cost, server-owned (mirrors service_timeline_days).
create or replace function public.research_mode_credits(m text)
returns integer language sql immutable as $$
  select case m
    when 'quick-pulse' then 100  when 'pulse-plus' then 200
    when 'signal-plus' then 400  when 'prism'      then 900
    else 100 end
$$;

create or replace function public.research_mode_respondents(m text)
returns integer language sql immutable as $$
  select case m
    when 'quick-pulse' then 50   when 'pulse-plus' then 100
    when 'signal-plus' then 200  when 'prism'      then 400
    else 50 end
$$;

-- ------------------------------------------------------------ research studies
create table if not exists public.research_studies (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  title        text not null default 'Untitled study',
  idea         text not null default '',
  decision_q   text not null default '',
  urls         jsonb not null default '[]',
  audience     jsonb not null default '{}',
  mode         text not null default 'quick-pulse',
  respondents  integer not null default 50,
  credits_cost integer not null default 100,
  status       text not null default 'running' check (status in ('draft','running','ready','failed')),
  survey       jsonb not null default '[]',
  personas     jsonb not null default '[]',
  memo         jsonb not null default '{}',
  followups    jsonb not null default '[]',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ------------------------------------------------ research credit ledger (study credits)
create table if not exists public.research_credit_ledger (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  amount     integer not null,        -- + purchased, - spent on studies / follow-ups
  reason     text not null default '',
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------------- RPCs

create or replace function public.research_credit_balance(uid uuid)
returns integer language sql stable security definer set search_path = public as
$$ select coalesce(sum(amount), 0)::integer from public.research_credit_ledger where user_id = uid $$;

-- Grant study credits after a successful pack purchase. Price/credits come from
-- the packs table, never the client. (Razorpay signature check is a later Edge
-- Function; treat p_payment_id as an unverified reference for now.)
create or replace function public.buy_research_credits(p_pack_id text, p_payment_id text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_pack public.research_packs;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select * into v_pack from public.research_packs where id = p_pack_id and active = true;
  if not found then raise exception 'Unknown credit pack'; end if;

  insert into public.research_credit_ledger (user_id, amount, reason)
  values (v_uid, v_pack.credits,
          v_pack.name || ' pack — ' || v_pack.credits || ' credits'
            || coalesce(' (ref ' || p_payment_id || ')', ''));

  return jsonb_build_object('ok', true, 'credits', v_pack.credits,
                            'balance', public.research_credit_balance(v_uid));
end $$;

-- Start a study: re-validate the mode cost, ensure balance, deduct atomically,
-- and create the study row. The survey/personas/memo are filled in afterwards by
-- save_study_result (client mock engine today, server LLM later).
create or replace function public.create_study(
  p_title text, p_idea text, p_decision_q text,
  p_urls jsonb default '[]', p_audience jsonb default '{}',
  p_mode text default 'quick-pulse'
) returns public.research_studies
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_cost  integer := public.research_mode_credits(p_mode);
  v_resp  integer := public.research_mode_respondents(p_mode);
  v_bal   integer;
  v_study public.research_studies;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  v_bal := public.research_credit_balance(v_uid);
  if v_bal < v_cost then raise exception 'Not enough credits (need %, have %)', v_cost, v_bal; end if;

  insert into public.research_studies (user_id, title, idea, decision_q, urls, audience,
                                       mode, respondents, credits_cost, status)
  values (v_uid, coalesce(nullif(trim(p_title), ''), 'Untitled study'),
          p_idea, p_decision_q, coalesce(p_urls, '[]'), coalesce(p_audience, '{}'),
          p_mode, v_resp, v_cost, 'running')
  returning * into v_study;

  insert into public.research_credit_ledger (user_id, amount, reason)
  values (v_uid, -v_cost, 'Study: ' || v_study.title);

  return v_study;
end $$;

-- Save generated output onto the caller's own study.
create or replace function public.save_study_result(
  p_study_id uuid, p_survey jsonb, p_personas jsonb, p_memo jsonb
) returns public.research_studies
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_study public.research_studies;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  update public.research_studies
     set survey = coalesce(p_survey, '[]'), personas = coalesce(p_personas, '[]'),
         memo = coalesce(p_memo, '{}'), status = 'ready', updated_at = now()
   where id = p_study_id and user_id = v_uid
  returning * into v_study;
  if not found then raise exception 'Study not found'; end if;
  return v_study;
end $$;

-- Ask a follow-up question of the simulated panel: 2 credits, appended to the study.
create or replace function public.research_followup(
  p_study_id uuid, p_question text, p_answer jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_bal  integer;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if not exists (select 1 from public.research_studies where id = p_study_id and user_id = v_uid) then
    raise exception 'Study not found';
  end if;
  v_bal := public.research_credit_balance(v_uid);
  if v_bal < 2 then raise exception 'Not enough credits (need 2, have %)', v_bal; end if;

  insert into public.research_credit_ledger (user_id, amount, reason)
  values (v_uid, -2, 'Follow-up question');

  update public.research_studies
     set followups = followups || jsonb_build_array(
           jsonb_build_object('q', p_question, 'a', p_answer, 'at', now())),
         updated_at = now()
   where id = p_study_id and user_id = v_uid;

  return jsonb_build_object('ok', true, 'balance', public.research_credit_balance(v_uid));
end $$;

-- Admin: adjust a user's study credits (parallels admin_adjust_credits for ₹).
create or replace function public.admin_adjust_research_credits(p_user_id uuid, p_amount integer, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only'; end if;
  insert into public.research_credit_ledger (user_id, amount, reason)
  values (p_user_id, p_amount, coalesce(p_reason, 'Adjustment by admin'));
end $$;

-- --------------------------------------------------------------------- RLS
alter table public.research_packs          enable row level security;
alter table public.research_studies        enable row level security;
alter table public.research_credit_ledger  enable row level security;

drop policy if exists "research_packs read"   on public.research_packs;
drop policy if exists "research_packs admin"   on public.research_packs;
create policy "research_packs read"  on public.research_packs for select using (active = true or public.is_admin());
create policy "research_packs admin" on public.research_packs for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "research_studies read" on public.research_studies;
create policy "research_studies read" on public.research_studies for select
  using (user_id = auth.uid() or public.is_admin());

drop policy if exists "research_ledger read" on public.research_credit_ledger;
create policy "research_ledger read" on public.research_credit_ledger for select
  using (user_id = auth.uid() or public.is_admin());

-- Browser gets no direct writes to studies or the ledger — everything goes
-- through the security-definer RPCs above.
revoke insert, update, delete on public.research_studies, public.research_credit_ledger from anon, authenticated;
grant  insert, update, delete on public.research_packs to authenticated; -- RLS restricts to admins

-- Done — Indizilla Research schema is in place.


-- ============================================================================
-- Research v2 — additions for the live inference pipeline.
-- Idempotent like the rest of this file; re-run the whole thing.
-- ============================================================================

-- Refund on failure. create_study deducts credits up front, which was fine
-- while generation was a free client-side mock. Once a run costs real money a
-- mid-run failure would leave the user charged for nothing.
create or replace function public.fail_study(p_study_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_study public.research_studies;
begin
  select * into v_study from public.research_studies
    where id = p_study_id and status = 'running'
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not running');  -- idempotent
  end if;
  if v_study.user_id <> auth.uid() and not public.is_admin() then
    raise exception 'Not your study';
  end if;

  update public.research_studies
     set status = 'failed', updated_at = now()
   where id = p_study_id;

  insert into public.research_credit_ledger (user_id, amount, reason)
  values (v_study.user_id, v_study.credits_cost,
          'Refund — study failed: ' || coalesce(p_reason, 'unknown'));

  return jsonb_build_object('ok', true, 'refunded', v_study.credits_cost,
                            'balance', public.research_credit_balance(v_study.user_id));
end $$;

-- Close the read-then-write gap in create_study. Two concurrent runs could both
-- pass the balance check and overdraw; an advisory lock held for the
-- transaction serialises them per user.
create or replace function public.create_study(
  p_title text, p_idea text, p_decision_q text,
  p_urls jsonb default '[]', p_audience jsonb default '{}',
  p_mode text default 'quick-pulse'
) returns public.research_studies
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_cost  integer := public.research_mode_credits(p_mode);
  v_resp  integer := public.research_mode_respondents(p_mode);
  v_bal   integer;
  v_study public.research_studies;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  perform pg_advisory_xact_lock(hashtext(v_uid::text));

  v_bal := public.research_credit_balance(v_uid);
  if v_bal < v_cost then raise exception 'Not enough credits (need %, have %)', v_cost, v_bal; end if;

  insert into public.research_studies (user_id, title, idea, decision_q, urls, audience,
                                       mode, respondents, credits_cost, status)
  values (v_uid, coalesce(nullif(trim(p_title), ''), 'Untitled study'),
          p_idea, p_decision_q, coalesce(p_urls, '[]'), coalesce(p_audience, '{}'),
          p_mode, v_resp, v_cost, 'running')
  returning * into v_study;

  insert into public.research_credit_ledger (user_id, amount, reason)
  values (v_uid, -v_cost, 'Study: ' || v_study.title);

  return v_study;
end $$;

-- Balance was readable for any profile UUID. Infeasible to enumerate, but a
-- security-definer function with no caller check is the wrong default.
create or replace function public.research_credit_balance(uid uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
begin
  if uid is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Not your balance';
  end if;
  return coalesce((select sum(amount) from public.research_credit_ledger
                    where user_id = uid), 0)::integer;
end $$;

-- Done — v2 additions in place.

-- ============================================================ callback_requests
-- Leads from the visiting-card page (/ANC). Anonymous visitors may INSERT and
-- nothing else: no select, no update, no delete — a lead form must never be a
-- read path. Handled operationally from the dashboard / SQL editor.
create table if not exists public.callback_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  phone text not null,
  email text,
  context text,
  intent text not null default 'callback' check (intent in ('callback', 'promo')),
  source text not null default 'ANC',
  handled boolean not null default false
);

alter table public.callback_requests enable row level security;

drop policy if exists "anon can request a callback" on public.callback_requests;
create policy "anon can request a callback"
  on public.callback_requests for insert
  to anon, authenticated
  with check (true);

-- ==================================================================== metrics
-- First-party page views: path, referrer host, coarse screen bucket. No
-- identifiers, no cookies, nothing joinable to a person — measurement the
-- privacy policy can describe in one honest sentence. Anon INSERT-only.
create table if not exists public.page_views (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  path text not null,
  ref text,
  screen text
);
alter table public.page_views enable row level security;
drop policy if exists "anon can record a page view" on public.page_views;
create policy "anon can record a page view"
  on public.page_views for insert to anon, authenticated with check (true);

-- ==================================================================== reviews
-- Real client reviews, inserted by the admin with the client's permission —
-- never by the public site. Anon may READ published rows only; there is no
-- anon write path, which is what keeps the section honest by construction.
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  author text not null,
  business text,
  quote text not null,
  rating integer check (rating between 1 and 5),
  source text not null default 'direct',      -- 'google' | 'direct' | ...
  permission boolean not null default false,  -- client agreed, in writing
  published boolean not null default false
);
alter table public.reviews enable row level security;
drop policy if exists "anyone can read published reviews" on public.reviews;
create policy "anyone can read published reviews"
  on public.reviews for select to anon, authenticated
  using (published = true and permission = true);

-- ============================================================ payment events
-- Razorpay webhook landing zone. The edge function verifies the signature and
-- writes here with the service role; nothing is exposed to anon at all.
create table if not exists public.payment_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event text not null,
  payment_id text,
  order_id uuid,
  amount integer,
  verified boolean not null default false,
  raw jsonb
);
alter table public.payment_events enable row level security;
-- no anon policies on purpose: service-role access only.

-- Orders learn whether their payment reference was confirmed by the gateway,
-- instead of the database taking the browser's word for it.
alter table public.orders add column if not exists payment_verified boolean not null default false;

create or replace function public.mark_payment_verified(p_payment_id text)
returns void language sql security definer set search_path = public as $$
  update public.orders set payment_verified = true
  where payment_id = p_payment_id;
$$;
-- The webhook function runs with the service role, which bypasses RLS; the
-- function exists so the update is one audited statement, not ad-hoc SQL.
revoke execute on function public.mark_payment_verified(text) from anon, authenticated;

-- ============================================ leads become workable (own CRM)
-- Admins read and work the lead queue from the dashboard; anon stays
-- INSERT-only. This is the "we sell CRM but don't use one" gap, closed.
drop policy if exists "admins can read leads" on public.callback_requests;
create policy "admins can read leads"
  on public.callback_requests for select to authenticated
  using (public.is_admin());
drop policy if exists "admins can update leads" on public.callback_requests;
create policy "admins can update leads"
  on public.callback_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Admins manage reviews from the dashboard (insert real ones, publish, pull).
drop policy if exists "admins manage reviews" on public.reviews;
create policy "admins manage reviews"
  on public.reviews for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ================================================================ subscribers
-- Newsletter capture: email in, nothing else required. Anon INSERT-only.
create table if not exists public.subscribers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  email text not null,
  source text not null default 'resources'
);
alter table public.subscribers enable row level security;
drop policy if exists "anon can subscribe" on public.subscribers;
create policy "anon can subscribe"
  on public.subscribers for insert to anon, authenticated with check (true);

-- ============================================================== client errors
-- The front line of monitoring: the site reports its own JS errors. Sampled
-- client-side; anon INSERT-only; worked from the dashboard/SQL editor.
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  path text,
  message text,
  source text
);
alter table public.client_errors enable row level security;
drop policy if exists "anon can report an error" on public.client_errors;
create policy "anon can report an error"
  on public.client_errors for insert to anon, authenticated with check (true);
