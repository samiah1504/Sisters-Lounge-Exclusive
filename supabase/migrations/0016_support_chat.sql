-- 0016 Customer support chat: "Chat with your Salon Manager".
-- Private customer↔staff conversations. Not AI, not a community.

create table public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer_profiles (id) on delete cascade,
  subject text not null check (length(subject) between 1 and 200),
  topic text not null default 'general'
    check (topic in ('subscription', 'booking', 'extra_services', 'products',
                     'consultation', 'payment', 'child_subscription',
                     'home_service', 'complaint', 'feedback', 'general')),
  status text not null default 'open'
    check (status in ('open', 'assigned', 'waiting_customer', 'waiting_salon',
                      'resolved', 'closed')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_staff_id uuid references public.profiles (id),
  related_subscription_id uuid references public.subscriptions (id),
  related_appointment_id uuid references public.appointments (id),
  last_message_at timestamptz not null default now(),
  last_customer_message_at timestamptz,
  last_staff_reply_at timestamptz,
  customer_last_read_at timestamptz not null default now(),
  staff_last_read_at timestamptz,
  first_response_seconds integer, -- for average first-response reporting
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_conversations_customer on public.support_conversations (customer_id);
create index idx_conversations_status on public.support_conversations (status, last_message_at desc);

create trigger trg_conversations_updated before update on public.support_conversations
for each row execute function public.set_updated_at();

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations (id) on delete cascade,
  sender_profile_id uuid not null references public.profiles (id),
  sender_type text not null check (sender_type in ('customer', 'staff')),
  body text not null check (length(body) between 1 and 5000),
  attachment_path text, -- private-storage path; served via signed URLs later
  is_internal_note boolean not null default false,
  hidden_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_messages_conversation on public.support_messages (conversation_id, created_at);

-- Message integrity: sender fields must be truthful, internal notes are
-- staff-only, customers cannot post into closed conversations.
create or replace function public.guard_support_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_conv public.support_conversations;
  v_is_staff boolean := public.is_staff_or_admin();
begin
  select * into v_conv from public.support_conversations
   where id = new.conversation_id for update;
  if not found then raise exception 'conversation not found'; end if;

  if auth.uid() is not null then
    new.sender_profile_id := auth.uid();
    new.sender_type := case when v_is_staff then 'staff' else 'customer' end;
  end if;
  if new.sender_type = 'customer' then
    new.is_internal_note := false; -- customers can never write internal notes
    if v_conv.status = 'closed' then
      raise exception 'CLOSED: this conversation is closed — start a new one';
    end if;
  end if;

  -- Keep conversation counters in sync.
  update public.support_conversations set
    last_message_at = now(),
    last_customer_message_at = case when new.sender_type = 'customer'
      then now() else last_customer_message_at end,
    last_staff_reply_at = case when new.sender_type = 'staff' and not new.is_internal_note
      then now() else last_staff_reply_at end,
    first_response_seconds = case
      when first_response_seconds is null and new.sender_type = 'staff'
           and not new.is_internal_note
      then extract(epoch from now() - created_at)::integer
      else first_response_seconds end,
    status = case
      when new.sender_type = 'customer' and status in ('waiting_customer', 'resolved')
        then 'waiting_salon'
      when new.sender_type = 'customer' and status = 'open' then 'open'
      when new.sender_type = 'staff' and not new.is_internal_note
           and status in ('open', 'assigned', 'waiting_salon')
        then 'waiting_customer'
      else status end,
    -- The sender has obviously read the thread up to now.
    customer_last_read_at = case when new.sender_type = 'customer'
      then now() else customer_last_read_at end,
    staff_last_read_at = case when new.sender_type = 'staff'
      then now() else staff_last_read_at end
  where id = new.conversation_id;

  return new;
end $$;

create trigger trg_support_message_guard before insert on public.support_messages
for each row execute function public.guard_support_message();

-- Messages are append-only for customers; staff may only hide (soft-delete).
create or replace function public.guard_support_message_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff_or_admin() then
    raise exception 'messages cannot be edited';
  end if;
  if new.body is distinct from old.body
     or new.conversation_id is distinct from old.conversation_id
     or new.sender_profile_id is distinct from old.sender_profile_id
     or new.is_internal_note is distinct from old.is_internal_note then
    raise exception 'only hiding a message is allowed';
  end if;
  return new;
end $$;

create trigger trg_support_message_update before update on public.support_messages
for each row execute function public.guard_support_message_update();

-- ------------------------------------------------------------ saved replies --
create table public.support_saved_replies (
  id uuid primary key default gen_random_uuid(),
  title text not null unique,
  body text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_saved_replies_updated before update on public.support_saved_replies
for each row execute function public.set_updated_at();

insert into public.support_saved_replies (title, body, display_order) values
  ('Booking confirmation explanation',
   'Assalamu alaikum! Your booking is received and reserved. The salon confirms every booking before the visit — you will see the status change to Confirmed, and your visit is only used after the appointment is completed.', 1),
  ('Subscription expiry explanation',
   'Your subscription runs for one monthly cycle. Unused visits expire at the end of the cycle and cannot be carried forward, so we encourage booking early. You can see your expiry date on your dashboard.', 2),
  ('Missed appointment response',
   'Sorry we missed you! Your visit was NOT deducted — it returned to your balance. Please pick another date from the booking page while your cycle is active.', 3),
  ('Home-service area explanation',
   'Home service is currently available within Ilorin only. If your address is inside Ilorin, please confirm your service area in your profile and the home option will appear during booking.', 4),
  ('Extra-service pricing response',
   'Extra services (like henna, trimming or manicure) are add-ons with their own fee, separate from your subscription visits. You can add them during booking and see the exact price before confirming.', 5),
  ('Payment-pending response',
   'Online payment is coming soon. Your selection is saved — the salon can also activate it manually for you. Nothing has been charged.', 6);
