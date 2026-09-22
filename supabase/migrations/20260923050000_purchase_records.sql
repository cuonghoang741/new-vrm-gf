-- Every purchase leaves a durable record, with the price the user actually paid.
--
-- Until now the only place a price or a currency existed was the text of a
-- Telegram message: `handle-revenuecat-webhook` read
-- `price_in_purchased_currency` and `currency` off the event, put them in a
-- chat line and threw them away. `subscriptions` kept tier/status/expiry and
-- nothing about the transaction; ruby packs credited the ledger and recorded
-- no sale at all. So there was no way to answer "what did this user pay, in
-- what currency, on which store" from the database.
--
-- This adds:
--   * `purchases` rows for BOTH subscriptions and consumables, one per store
--     transaction per event, with price, currency, store, environment and the
--     raw event kept in metadata;
--   * the same facts on `subscriptions`, so the current state carries the last
--     price without a join;
--   * `record_purchase()` for the webhook (service_role only).
--
-- Also fixes a ruby leak: `app_bond_claim` wrote its ledger row with the quest
-- id alone as `ref`, while `_ruby_apply` dedups on (user, reason, ref). A DAILY
-- bond quest could therefore be claimed every day but only ever paid once —
-- the second day cleared the quest, granted the XP, returned reward_ruby > 0
-- and credited nothing.

-- ── purchases: the columns a sale needs ─────────────────────────────────────
alter table public.purchases
  add column if not exists price numeric(14, 4),
  add column if not exists store text,
  add column if not exists environment text,
  add column if not exists period_type text,
  add column if not exists event_type text,
  add column if not exists purchased_at timestamptz;

comment on column public.purchases.price is
  'Price in `currency_code`, as the store reported it (price_in_purchased_currency). `price_cents` is the legacy column from the old app and is left alone.';

-- One row per (transaction, event). RENEWAL after RENEWAL has distinct
-- transaction ids; a webhook retry repeats both, so this is the idempotency
-- key that makes retries free.
create unique index if not exists purchases_txn_event_uniq
  on public.purchases (transaction_id, event_type)
  where transaction_id is not null;

alter table public.purchases enable row level security;
-- Reading your own receipts is fine; writing them is the webhook's job.
drop policy if exists purchases_select_self on public.purchases;
create policy purchases_select_self on public.purchases
  for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.purchases from anon, authenticated;

-- ── subscriptions: carry the money too ──────────────────────────────────────
alter table public.subscriptions
  add column if not exists price numeric(14, 4),
  add column if not exists currency_code text,
  add column if not exists store text,
  add column if not exists environment text,
  add column if not exists period_type text,
  add column if not exists transaction_id text,
  add column if not exists purchased_at timestamptz;

-- ── the webhook's recorder ──────────────────────────────────────────────────
create or replace function public.record_purchase(
  p_user_id uuid,
  p_product_id text,
  p_transaction_id text,
  p_event_type text,
  p_price numeric default null,
  p_currency text default null,
  p_store text default null,
  p_environment text default null,
  p_period_type text default null,
  p_ruby_added integer default null,
  p_purchased_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    return jsonb_build_object('error', 'unknown_user');
  end if;

  insert into purchases (
    user_id, product_id, transaction_id, event_type, price, currency_code,
    store, platform, environment, period_type, ruby_added, purchased_at, metadata
  ) values (
    p_user_id, p_product_id, p_transaction_id, p_event_type, p_price, p_currency,
    p_store,
    case when p_store = 'APP_STORE' then 'ios'
         when p_store = 'PLAY_STORE' then 'android'
         else lower(coalesce(p_store, 'unknown')) end,
    p_environment, p_period_type, p_ruby_added,
    coalesce(p_purchased_at, now()), coalesce(p_metadata, '{}'::jsonb)
  )
  -- The index is partial, so the conflict target must repeat its predicate;
  -- without it Postgres cannot infer the index and the insert errors out.
  on conflict (transaction_id, event_type) where transaction_id is not null do update
     set price = excluded.price,
         currency_code = excluded.currency_code,
         metadata = excluded.metadata
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

revoke all on function public.record_purchase(uuid, text, text, text, numeric, text, text, text, text, integer, timestamptz, jsonb)
  from public, anon, authenticated;

-- ── ruby leak: daily bond quests paid once, ever ────────────────────────────
CREATE OR REPLACE FUNCTION public.app_bond_claim(p_quest_id uuid, p_character_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  q character_quests;
  v_period text;
  v_row user_character_quests;
  v_diff smallint;
  v_xp integer;
  v_before smallint; v_after smallint;
  v_today date := (now() at time zone 'utc')::date;
begin
  if v_uid is null then return jsonb_build_object('error', 'not_signed_in'); end if;
  select * into q from character_quests where id = p_quest_id and is_active;
  if q.id is null then return jsonb_build_object('error', 'no_quest'); end if;

  v_period := case when q.kind = 'daily' then to_char(v_today, 'YYYY-MM-DD') else 'once' end;

  select * into v_row from user_character_quests
   where user_id = v_uid and quest_id = p_quest_id and period = v_period for update;

  if v_row.user_id is null or v_row.progress < q.target then
    return jsonb_build_object('error', 'not_complete');
  end if;
  if v_row.claimed_at is not null then
    return jsonb_build_object('error', 'already_claimed');
  end if;

  update user_character_quests set claimed_at = now()
   where user_id = v_uid and quest_id = p_quest_id and period = v_period;

  select difficulty into v_diff from characters where id = p_character_id;

  insert into user_bond (user_id, character_id) values (v_uid, p_character_id)
  on conflict (user_id, character_id) do nothing;

  select xp into v_xp from user_bond
   where user_id = v_uid and character_id = p_character_id for update;

  v_before := _bond_level_for(v_xp, v_diff);
  v_after  := _bond_level_for(v_xp + q.reward_xp, v_diff);

  update user_bond set xp = xp + q.reward_xp, level = v_after, updated_at = now()
   where user_id = v_uid and character_id = p_character_id;

  -- Quest ruby goes through the ledger like every other payout.
  if q.reward_ruby > 0 then
    -- The period belongs in the ref. Without it the ledger's
    -- (user, reason, ref) uniqueness swallowed every claim after the
    -- first, so a DAILY bond quest paid its ruby exactly once, ever,
    -- while still reporting reward_ruby > 0 to the app.
    perform _ruby_apply(v_uid, q.reward_ruby, 'bond_quest',
                        p_quest_id::text || ':' || v_period);
  end if;

  return jsonb_build_object('ok', true, 'reward_xp', q.reward_xp,
                            'reward_ruby', q.reward_ruby,
                            'xp', v_xp + q.reward_xp, 'level', v_after,
                            'leveled_up', v_after > v_before);
end $function$;

revoke all on function public.app_bond_claim(uuid, uuid) from public, anon;
grant execute on function public.app_bond_claim(uuid, uuid) to authenticated;

-- A refund should be able to say how much it took back, so the purchases row
-- can carry the negative ruby the way a grant carries the positive one.
create or replace function public.revoke_ruby_pack(
  p_user_id uuid, p_product_id text, p_transaction_id text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_amt integer; v_have integer; v_bal integer; v_taken integer;
begin
  select delta into v_amt from ruby_ledger
   where user_id = p_user_id and reason = 'pack' and ref = p_transaction_id;
  if v_amt is null then return jsonb_build_object('error', 'not_granted'); end if;
  select coalesce(ruby, 0) into v_have from user_currency where user_id = p_user_id;
  v_taken := least(v_amt, v_have);
  v_bal := _ruby_apply(p_user_id, -v_taken, 'pack_refund', p_transaction_id);
  return jsonb_build_object('ok', true, 'ruby', v_bal, 'revoked', v_taken);
end $$;

revoke all on function public.revoke_ruby_pack(uuid, text, text) from public, anon, authenticated;
grant execute on function public.revoke_ruby_pack(uuid, text, text) to service_role;
