-- In-app reporting of offensive AI-generated content.
--
-- Google Play's AI-Generated Content policy requires that a user can flag
-- offensive output *without leaving the app*; the store rejected the build for
-- not having one. This is the table behind that flow: a chat message, a photo
-- in her gallery, or a character as a whole.
--
-- Writes go through `report_content()` rather than a plain insert, so the
-- snapshot of what was reported is taken server-side (a client that lies about
-- the text it is reporting makes the queue useless) and so one account cannot
-- flood the queue.

create table if not exists public.content_reports (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users (id) on delete cascade,
    kind          text not null check (kind in ('chat_message', 'media', 'character')),
    -- Chat messages live in the conversation row, not a table of their own, so
    -- this is free-form text rather than a foreign key.
    target_id     text,
    character_id  uuid references public.characters (id) on delete set null,
    reason        text not null check (reason in (
                      'sexual', 'harassment', 'hate', 'violence',
                      'self_harm', 'minor', 'other')),
    note          text,
    -- What the user actually saw: the message text, or the media URL.
    snapshot      text,
    status        text not null default 'open'
                      check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
    created_at    timestamptz not null default now()
);

create index if not exists content_reports_open_idx
    on public.content_reports (created_at desc)
    where status = 'open';
create index if not exists content_reports_user_idx
    on public.content_reports (user_id, created_at desc);

alter table public.content_reports enable row level security;

-- A reporter may see their own reports (the app shows "already reported"), and
-- nothing else. Moderation happens with the service role, from the CMS.
drop policy if exists content_reports_select_own on public.content_reports;
create policy content_reports_select_own on public.content_reports
    for select using (auth.uid() = user_id);

/**
 * Files one report and returns its id.
 *
 * SECURITY DEFINER with no INSERT policy on the table: the only way in is
 * through here, which pins `user_id` to the caller and caps the volume.
 */
create or replace function public.report_content(
    p_kind         text,
    p_reason       text,
    p_target_id    text default null,
    p_character_id uuid default null,
    p_note         text default null,
    p_snapshot     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user  uuid := auth.uid();
    v_today int;
    v_id    uuid;
begin
    if v_user is null then
        return jsonb_build_object('error', 'not_authenticated');
    end if;

    -- A report queue anyone can fill with ten thousand rows is a report queue
    -- nobody reads.
    select count(*) into v_today
    from content_reports
    where user_id = v_user and created_at > now() - interval '24 hours';

    if v_today >= 30 then
        return jsonb_build_object('error', 'rate_limited');
    end if;

    -- Same user flagging the same thing twice is a no-op, not a second row.
    select id into v_id
    from content_reports
    where user_id = v_user
      and kind = p_kind
      and target_id is not distinct from p_target_id
    limit 1;

    if v_id is not null then
        return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', true);
    end if;

    insert into content_reports (user_id, kind, target_id, character_id, reason, note, snapshot)
    values (v_user, p_kind, p_target_id, p_character_id, p_reason,
            nullif(btrim(p_note), ''), left(p_snapshot, 2000))
    returning id into v_id;

    return jsonb_build_object('ok', true, 'id', v_id, 'duplicate', false);
end;
$$;

revoke all on function public.report_content(text, text, text, uuid, text, text) from public;
grant execute on function public.report_content(text, text, text, uuid, text, text) to authenticated;
