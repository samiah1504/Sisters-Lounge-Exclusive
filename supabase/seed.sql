-- Development seed data. DEV/TEST ONLY — no real customer data.
-- Fixed UUIDs (prefix 11111111/22222222/…) keep references readable.
-- On hosted Supabase, create the auth users first with
-- scripts/create-dev-users.ts (service role), then run this file.

begin;

-- ------------------------------------------------------------------- users --
-- Local/dev: rows in auth.users trigger profile creation.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-0000-0000-0000-000000000001', 'admin@sisterslounge.test', '{"full_name":"Salon Admin"}'),
  ('11111111-0000-0000-0000-000000000002', 'amina.stylist@sisterslounge.test', '{"full_name":"Amina Stylist"}'),
  ('11111111-0000-0000-0000-000000000003', 'maryam@customer.test', '{"full_name":"Maryam Bello"}'),
  ('11111111-0000-0000-0000-000000000004', 'khadija@customer.test', '{"full_name":"Khadija Yusuf"}'),
  ('11111111-0000-0000-0000-000000000005', 'fatima@customer.test', '{"full_name":"Fatima Abdullahi"}'),
  ('11111111-0000-0000-0000-000000000006', 'aisha.parent@customer.test', '{"full_name":"Aisha Ibrahim"}'),
  ('11111111-0000-0000-0000-000000000007', 'zainab@customer.test', '{"full_name":"Zainab Suleiman"}')
on conflict (id) do nothing;

update public.profiles set role = 'admin', phone = '+2348030000001' where id = '11111111-0000-0000-0000-000000000001';
update public.profiles set role = 'staff', phone = '+2348030000002' where id = '11111111-0000-0000-0000-000000000002';
update public.profiles set phone = '+234803000000' || (right(id::text, 1)) where role = 'customer';

-- Staff/admin do not need customer profiles (auto-created before role change).
delete from public.customer_profiles where profile_id in
  (select id from public.profiles where role in ('admin', 'staff'));

-- Stylist skills + working hours (Mon-Sat, 9-6).
insert into public.stylist_skills (staff_profile_id, skill) values
  ('11111111-0000-0000-0000-000000000002', 'natural-hair'),
  ('11111111-0000-0000-0000-000000000002', 'kids-hair'),
  ('11111111-0000-0000-0000-000000000002', 'colouring');
insert into public.staff_working_hours (staff_profile_id, salon_id, day_of_week, start_time, end_time)
select '11111111-0000-0000-0000-000000000002', '77770001-0000-0000-0000-000000000001', d, '09:00', '18:00' from generate_series(1, 6) d;

-- Complete customer profiles so booking readiness passes.
update public.customer_profiles cp set
  whatsapp_number = p.phone,
  address = '12 Unity Road', city = 'Ilorin', state = 'Kwara',
  marketing_consent = true
from public.profiles p
where cp.profile_id = p.id and p.role = 'customer';

-- Children for Aisha (parent with two children).
insert into public.children (id, customer_id, full_name, date_of_birth, gender, allergies, hair_scalp_notes)
select ('22222222-0000-0000-0000-00000000000' || n)::uuid,
       (select cp.id from public.customer_profiles cp join public.profiles p on p.id = cp.profile_id
        where p.email = 'aisha.parent@customer.test'),
       child_name, dob, 'female', allergy, notes
from (values
  ('1', 'Hafsat Ibrahim', '2018-03-14'::date, 'None known', 'Thick 4c hair, tender scalp'),
  ('2', 'Sumayya Ibrahim', '2020-11-02'::date, 'Sensitive to shea butter', 'Fine curls, keeps protective styles well')
) as c(n, child_name, dob, allergy, notes);

-- -------------------------------------------------------------- categories --
insert into public.subscription_categories
  (id, name, slug, short_description, display_order, eligibility_notes) values
  ('33333333-0000-0000-0000-000000000001', 'Adult', 'adult',
   'Monthly plans for adults who want consistent salon care.', 1, ''),
  ('33333333-0000-0000-0000-000000000002', 'Kids', 'kids',
   'Gentle plans for children, managed from a parent account.', 2,
   'For children aged 12 and under.'),
  ('33333333-0000-0000-0000-000000000003', 'Undergraduate', 'undergraduate',
   'Student-friendly pricing for consistent care on a budget.', 3,
   'A valid student ID is required at your first visit.');

-- ---------------------------------------------------------------- services --
insert into public.services (id, name, slug, description, category, estimated_duration_minutes,
                             eligible_age_group, display_order) values
  ('44444444-0000-0000-0000-000000000001', 'Wash & Deep Condition', 'wash-deep-condition',
   'Cleanse, deep condition and blow-out.', 'care', 60, 'all', 1),
  ('44444444-0000-0000-0000-000000000002', 'Protective Styling', 'protective-styling',
   'Braids, twists or cornrows to protect and retain length.', 'styling', 120, 'all', 2),
  ('44444444-0000-0000-0000-000000000003', 'Deep Treatment & Steam', 'deep-treatment-steam',
   'Intensive treatment with steam for maximum absorption.', 'treatment', 75, 'all', 3),
  ('44444444-0000-0000-0000-000000000004', 'Kids Wash & Style', 'kids-wash-style',
   'Gentle wash, detangle and simple style for children.', 'kids', 60, 'children', 4),
  ('44444444-0000-0000-0000-000000000005', 'Natural Styling', 'natural-styling',
   'Twist-outs, updos and everyday natural styles.', 'styling', 90, 'adults', 5);

-- -------------------------------------------------------------------- plans --
insert into public.subscription_plans
  (id, organisation_id, category_id, name, slug, plan_code, tier_label, short_description,
   monthly_price_kobo, visits_included, min_visit_interval_days,
   eligible_age_group, is_featured, display_order, status, terms) values
  ('55555555-0000-0000-0000-000000000001', (select id from public.organisations limit 1),
   '33333333-0000-0000-0000-000000000001', 'Basic', 'basic', 'SL-AD-BASIC', 'Basic',
   'Essential monthly care — wash, condition and simple styling.',
   1500000, 2, 7, 'adults', false, 1, 'active',
   'Visits expire at cycle end and cannot roll over. Visits must be at least 7 days apart.'),
  ('55555555-0000-0000-0000-000000000002', (select id from public.organisations limit 1),
   '33333333-0000-0000-0000-000000000001', 'Deluxe', 'deluxe', 'SL-AD-DELUXE', 'Deluxe',
   'A fuller routine with monthly treatments for steady growth.',
   2500000, 3, 7, 'adults', true, 2, 'active',
   'Visits expire at cycle end and cannot roll over. Visits must be at least 7 days apart.'),
  ('55555555-0000-0000-0000-000000000003', (select id from public.organisations limit 1),
   '33333333-0000-0000-0000-000000000001', 'Premium', 'premium', 'SL-AD-PREMIUM', 'Premium',
   'The complete Sisters Lounge experience, every week.',
   4000000, 4, 7, 'adults', false, 3, 'active',
   'Visits expire at cycle end and cannot roll over. Visits must be at least 7 days apart.'),
  ('55555555-0000-0000-0000-000000000004', (select id from public.organisations limit 1),
   '33333333-0000-0000-0000-000000000003', 'Undergraduate', 'undergraduate-plan', 'SL-UG-BASIC', 'Basic',
   'Student-friendly pricing for consistent monthly care.',
   1000000, 2, 7, 'adults', false, 4, 'active',
   'Valid student ID required. Visits expire at cycle end.'),
  ('55555555-0000-0000-0000-000000000005', (select id from public.organisations limit 1),
   '33333333-0000-0000-0000-000000000002', 'Kids', 'kids-plan', 'SL-KD-BASIC', 'Basic',
   'Gentle monthly care for children, managed by a parent.',
   1200000, 2, 7, 'children', false, 5, 'active',
   'For children 12 and under. Visits expire at cycle end.');

-- Included services per plan.
insert into public.subscription_plan_services (plan_id, service_id, relation) values
  ('55555555-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', 'included'),
  ('55555555-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000002', 'optional'),
  ('55555555-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000001', 'included'),
  ('55555555-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000002', 'included'),
  ('55555555-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000003', 'included'),
  ('55555555-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000001', 'included'),
  ('55555555-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000002', 'included'),
  ('55555555-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000003', 'included'),
  ('55555555-0000-0000-0000-000000000003', '44444444-0000-0000-0000-000000000005', 'included'),
  ('55555555-0000-0000-0000-000000000004', '44444444-0000-0000-0000-000000000001', 'included'),
  ('55555555-0000-0000-0000-000000000005', '44444444-0000-0000-0000-000000000004', 'included');

-- ------------------------------------------------------------ extra services --
insert into public.extra_service_categories (id, name, slug, display_order) values
  ('66666666-0000-0000-0000-000000000001', 'Beauty', 'beauty', 1),
  ('66666666-0000-0000-0000-000000000002', 'Hair Extras', 'hair-extras', 2),
  ('66666666-0000-0000-0000-000000000003', 'Treatments', 'treatments', 3);

insert into public.extra_services
  (id, name, slug, short_description, price_kobo, estimated_duration_minutes,
   category_id, is_featured, payment_requirement, display_order) values
  ('77777777-0000-0000-0000-000000000001', 'Henna', 'henna',
   'Traditional henna art for hands or feet.', 500000, 45,
   '66666666-0000-0000-0000-000000000001', true, 'pay_at_salon', 1),
  ('77777777-0000-0000-0000-000000000002', 'Beading', 'beading',
   'Beautiful beads added to braids or twists.', 300000, 30,
   '66666666-0000-0000-0000-000000000002', false, 'pay_at_salon', 2),
  ('77777777-0000-0000-0000-000000000003', 'Manicure', 'manicure',
   'Neat, polished nails while you get your hair done.', 400000, 40,
   '66666666-0000-0000-0000-000000000001', false, 'pay_at_salon', 3),
  ('77777777-0000-0000-0000-000000000004', 'Pedicure', 'pedicure',
   'Relaxing pedicure with a tidy finish.', 450000, 45,
   '66666666-0000-0000-0000-000000000001', false, 'pay_at_salon', 4),
  ('77777777-0000-0000-0000-000000000005', 'Hair Trimming', 'hair-trimming',
   'Precise trim to keep ends healthy.', 400000, 20,
   '66666666-0000-0000-0000-000000000002', true, 'pay_at_salon', 5),
  ('77777777-0000-0000-0000-000000000006', 'Hair Colouring', 'hair-colouring',
   'Professional colour — requires advance notice.', 1500000, 90,
   '66666666-0000-0000-0000-000000000002', false, 'pay_before_confirmation', 6),
  ('77777777-0000-0000-0000-000000000007', 'Steam Treatment', 'steam-treatment',
   'Add a steam session for deeper hydration.', 350000, 30,
   '66666666-0000-0000-0000-000000000003', true, 'pay_at_salon', 7);

update public.extra_services set min_advance_notice_hours = 48
where slug = 'hair-colouring';

-- Hair colouring: adults only (not eligible for the Kids category).
insert into public.extra_service_customer_eligibility (extra_service_id, category_id) values
  ('77777777-0000-0000-0000-000000000006', '33333333-0000-0000-0000-000000000001'),
  ('77777777-0000-0000-0000-000000000006', '33333333-0000-0000-0000-000000000003');

-- ------------------------------------------------------------- consultations --
insert into public.consultation_types
  (name, slug, short_description, price_kobo, duration_minutes, location_type, display_order) values
  ('General Hair Consultation', 'general-hair', 'A full review of your routine, goals and hair condition.', 500000, 30, 'salon', 1),
  ('Hair & Scalp Assessment', 'hair-scalp-assessment', 'A closer look at scalp health, breakage and build-up.', 700000, 45, 'salon', 2),
  ('Children''s Hair Consultation', 'childrens-hair', 'Age-appropriate care plans for your child''s hair.', 400000, 30, 'salon', 3),
  ('Postpartum Hair Consultation', 'postpartum-hair', 'Support for shedding and regrowth after childbirth.', 600000, 45, 'virtual', 4),
  ('Transitioning Hair Consultation', 'transitioning-hair', 'Guidance for moving from relaxed to natural hair.', 600000, 45, 'salon', 5),
  ('Product Recommendation Consultation', 'product-recommendation', 'A personalised product line-up matched to your hair.', 350000, 20, 'virtual', 6);

-- ------------------------------------------------------------------ products --
insert into public.product_categories (id, name, slug, display_order) values
  ('88888888-0000-0000-0000-000000000001', 'Cleanse & Condition', 'cleanse-condition', 1),
  ('88888888-0000-0000-0000-000000000002', 'Oils & Treatments', 'oils-treatments', 2),
  ('88888888-0000-0000-0000-000000000003', 'Kids', 'kids-products', 3),
  ('88888888-0000-0000-0000-000000000004', 'Accessories', 'accessories', 4);

insert into public.products
  (name, slug, sku, short_description, category_id, price_kobo, subscriber_price_kobo,
   stock_status, is_featured, age_suitability, display_order) values
  ('Moisture Shampoo', 'moisture-shampoo', 'SL-SH-001',
   'Sulphate-free cleansing for dry and natural hair.',
   '88888888-0000-0000-0000-000000000001', 450000, 400000, 'in_stock', true, 'all', 1),
  ('Deep Conditioner', 'deep-conditioner', 'SL-CO-001',
   'Rich weekly conditioner for softness and slip.',
   '88888888-0000-0000-0000-000000000001', 480000, 430000, 'in_stock', true, 'all', 2),
  ('Leave-in Conditioner', 'leave-in-conditioner', 'SL-LI-001',
   'Daily moisture without build-up.',
   '88888888-0000-0000-0000-000000000001', 520000, 470000, 'in_stock', false, 'all', 3),
  ('Nourishing Hair Oil', 'nourishing-hair-oil', 'SL-OI-001',
   'Sealing blend with jojoba and castor oil.',
   '88888888-0000-0000-0000-000000000002', 350000, 320000, 'in_stock', false, 'all', 4),
  ('Scalp Treatment Serum', 'scalp-treatment-serum', 'SL-TR-001',
   'Soothing serum for itchy or flaky scalps.',
   '88888888-0000-0000-0000-000000000002', 600000, 550000, 'low_stock', false, 'all', 5),
  ('Gentle Kids Shampoo', 'gentle-kids-shampoo', 'SL-KD-001',
   'Tear-free wash for little curls.',
   '88888888-0000-0000-0000-000000000003', 300000, 270000, 'in_stock', false, 'children', 6),
  ('Satin Bonnet', 'satin-bonnet', 'SL-AC-001',
   'Protects styles and keeps moisture in overnight.',
   '88888888-0000-0000-0000-000000000004', 150000, 150000, 'in_stock', false, 'all', 7);

-- --------------------------------------------------------- recommendations --
insert into public.recommendation_rules (id, name, context, badge_label, priority) values
  ('99999999-0000-0000-0000-000000000001', 'Booking add-ons everyone loves', 'booking',
   'Customers often add', 10),
  ('99999999-0000-0000-0000-000000000002', 'Deluxe visit enhancers', 'plan_detail',
   'Recommended for this plan', 20),
  ('99999999-0000-0000-0000-000000000003', 'After-visit product care', 'post_appointment',
   'Keep the result at home', 10);

insert into public.recommendation_targets (rule_id, target_type, target_id) values
  ('99999999-0000-0000-0000-000000000001', 'all', null),
  ('99999999-0000-0000-0000-000000000002', 'plan', '55555555-0000-0000-0000-000000000002'),
  ('99999999-0000-0000-0000-000000000003', 'all', null);

insert into public.recommendation_items (rule_id, item_type, item_id, display_order) values
  ('99999999-0000-0000-0000-000000000001', 'extra_service', '77777777-0000-0000-0000-000000000001', 1),
  ('99999999-0000-0000-0000-000000000001', 'extra_service', '77777777-0000-0000-0000-000000000005', 2),
  ('99999999-0000-0000-0000-000000000002', 'extra_service', '77777777-0000-0000-0000-000000000007', 1),
  ('99999999-0000-0000-0000-000000000003', 'product',
   (select id from public.products where slug = 'leave-in-conditioner'), 1),
  ('99999999-0000-0000-0000-000000000003', 'product',
   (select id from public.products where slug = 'nourishing-hair-oil'), 2);

-- ------------------------------------------------- subscriptions & bookings --
-- Helper CTE-style: look up customer ids by email.
-- Maryam: active Deluxe subscription, one upcoming appointment.
-- Khadija: active Basic, one visit remaining (one consumed).
-- Fatima: active Basic, unused visits, no bookings (retention target).
-- Aisha: two children, one Kids subscription per child.
-- Zainab: expired subscription + pending Basic selection + missed appointment.

do $seed$
declare
  v_org uuid := (select id from public.organisations limit 1);
  v_maryam uuid; v_khadija uuid; v_fatima uuid; v_aisha uuid; v_zainab uuid;
  v_child1 uuid := '22222222-0000-0000-0000-000000000001';
  v_child2 uuid := '22222222-0000-0000-0000-000000000002';
  v_sub uuid; v_cycle uuid; v_appt uuid; v_ent uuid;
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  i integer;
begin
  select cp.id into v_maryam from public.customer_profiles cp
    join public.profiles p on p.id = cp.profile_id where p.email = 'maryam@customer.test';
  select cp.id into v_khadija from public.customer_profiles cp
    join public.profiles p on p.id = cp.profile_id where p.email = 'khadija@customer.test';
  select cp.id into v_fatima from public.customer_profiles cp
    join public.profiles p on p.id = cp.profile_id where p.email = 'fatima@customer.test';
  select cp.id into v_aisha from public.customer_profiles cp
    join public.profiles p on p.id = cp.profile_id where p.email = 'aisha.parent@customer.test';
  select cp.id into v_zainab from public.customer_profiles cp
    join public.profiles p on p.id = cp.profile_id where p.email = 'zainab@customer.test';

  -- ---- Maryam: Deluxe active, cycle started 10 days ago -------------------
  insert into public.subscriptions (customer_id, plan_id, plan_version_id, status, activation_source, home_salon_id)
  values (v_maryam, '55555555-0000-0000-0000-000000000002',
          public.latest_plan_version('55555555-0000-0000-0000-000000000002'), 'active', 'manual', '77770001-0000-0000-0000-000000000001')
  returning id into v_sub;
  insert into public.subscription_cycles (subscription_id, cycle_number, starts_on, ends_on, visits_included)
  values (v_sub, 1, v_today - 10, v_today - 10 + interval '1 month', 3) returning id into v_cycle;
  for i in 1..3 loop
    insert into public.visit_entitlements (cycle_id, seq_number) values (v_cycle, i);
  end loop;

  -- Completed appointment 8 days ago (visit consumed).
  insert into public.appointments (customer_id, subscription_id, cycle_id, service_id, salon_id,
    starts_at, ends_at, duration_minutes, status, completed_at)
  values (v_maryam, v_sub, v_cycle, '44444444-0000-0000-0000-000000000001', '77770001-0000-0000-0000-000000000001',
    (v_today - 8 + time '10:00') at time zone 'Africa/Lagos',
    (v_today - 8 + time '11:00') at time zone 'Africa/Lagos', 60, 'completed', now() - interval '8 days')
  returning id into v_appt;
  select id into v_ent from public.visit_entitlements where cycle_id = v_cycle and seq_number = 1;
  update public.visit_entitlements set status = 'consumed', consumed_at = now() - interval '8 days' where id = v_ent;
  insert into public.visit_reservations (entitlement_id, appointment_id, status, released_at)
  values (v_ent, v_appt, 'converted', now() - interval '8 days');

  -- Upcoming appointment in 3 days with henna + trimming add-ons (reserved).
  insert into public.appointments (customer_id, subscription_id, cycle_id, service_id, salon_id,
    starts_at, ends_at, duration_minutes, status, addon_total_kobo,
    stylist_profile_id, customer_notes)
  values (v_maryam, v_sub, v_cycle, '44444444-0000-0000-0000-000000000003', '77770001-0000-0000-0000-000000000001',
    (v_today + 3 + time '10:00') at time zone 'Africa/Lagos',
    (v_today + 3 + time '12:20') at time zone 'Africa/Lagos', 140, 'assigned', 900000,
    '11111111-0000-0000-0000-000000000002', 'Please use the rose oil if available')
  returning id into v_appt;
  select id into v_ent from public.visit_entitlements where cycle_id = v_cycle and seq_number = 2;
  update public.visit_entitlements set status = 'reserved' where id = v_ent;
  insert into public.visit_reservations (entitlement_id, appointment_id) values (v_ent, v_appt);
  insert into public.appointment_extra_services
    (appointment_id, extra_service_id, price_kobo, duration_minutes, payment_requirement) values
    (v_appt, '77777777-0000-0000-0000-000000000001', 500000, 45, 'pay_at_salon'),
    (v_appt, '77777777-0000-0000-0000-000000000005', 400000, 20, 'pay_at_salon');

  -- ---- Khadija: Basic active, one visit left ------------------------------
  insert into public.subscriptions (customer_id, plan_id, plan_version_id, status, activation_source, home_salon_id)
  values (v_khadija, '55555555-0000-0000-0000-000000000001',
          public.latest_plan_version('55555555-0000-0000-0000-000000000001'), 'active', 'manual', '77770001-0000-0000-0000-000000000001')
  returning id into v_sub;
  insert into public.subscription_cycles (subscription_id, cycle_number, starts_on, ends_on, visits_included)
  values (v_sub, 1, v_today - 20, v_today - 20 + interval '1 month', 2) returning id into v_cycle;
  insert into public.visit_entitlements (cycle_id, seq_number, status, consumed_at)
  values (v_cycle, 1, 'consumed', now() - interval '12 days');
  insert into public.visit_entitlements (cycle_id, seq_number) values (v_cycle, 2);
  insert into public.appointments (customer_id, subscription_id, cycle_id, service_id, salon_id,
    starts_at, ends_at, duration_minutes, status, completed_at)
  values (v_khadija, v_sub, v_cycle, '44444444-0000-0000-0000-000000000001', '77770001-0000-0000-0000-000000000001',
    (v_today - 12 + time '11:00') at time zone 'Africa/Lagos',
    (v_today - 12 + time '12:00') at time zone 'Africa/Lagos', 60, 'completed', now() - interval '12 days');

  -- ---- Fatima: Basic active, nothing booked (retention target) ------------
  insert into public.subscriptions (customer_id, plan_id, plan_version_id, status, activation_source, home_salon_id)
  values (v_fatima, '55555555-0000-0000-0000-000000000001',
          public.latest_plan_version('55555555-0000-0000-0000-000000000001'), 'active', 'manual', '77770001-0000-0000-0000-000000000001')
  returning id into v_sub;
  insert into public.subscription_cycles (subscription_id, cycle_number, starts_on, ends_on, visits_included)
  values (v_sub, 1, v_today - 9, v_today - 9 + interval '1 month', 2) returning id into v_cycle;
  insert into public.visit_entitlements (cycle_id, seq_number) values (v_cycle, 1), (v_cycle, 2);

  -- ---- Aisha: Kids subscriptions for both children ------------------------
  for i in 1..2 loop
    insert into public.subscriptions (customer_id, child_id, plan_id, plan_version_id, status, activation_source, home_salon_id)
    values (v_aisha, case when i = 1 then v_child1 else v_child2 end,
            '55555555-0000-0000-0000-000000000005',
            public.latest_plan_version('55555555-0000-0000-0000-000000000005'), 'active', 'manual', '77770001-0000-0000-0000-000000000001')
    returning id into v_sub;
    insert into public.subscription_cycles (subscription_id, cycle_number, starts_on, ends_on, visits_included)
    values (v_sub, 1, v_today - 5, v_today - 5 + interval '1 month', 2) returning id into v_cycle;
    insert into public.visit_entitlements (cycle_id, seq_number) values (v_cycle, 1), (v_cycle, 2);
  end loop;

  -- Upcoming kids appointment for Hafsat in 5 days.
  select s.id, c.id into v_sub, v_cycle from public.subscriptions s
    join public.subscription_cycles c on c.subscription_id = s.id
    where s.child_id = v_child1;
  insert into public.appointments (customer_id, child_id, subscription_id, cycle_id, service_id, salon_id,
    starts_at, ends_at, duration_minutes, status)
  values (v_aisha, v_child1, v_sub, v_cycle, '44444444-0000-0000-0000-000000000004',
    '77770001-0000-0000-0000-000000000001',
    (v_today + 5 + time '12:00') at time zone 'Africa/Lagos',
    (v_today + 5 + time '13:00') at time zone 'Africa/Lagos', 60, 'confirmed')
  returning id into v_appt;
  select id into v_ent from public.visit_entitlements where cycle_id = v_cycle and seq_number = 1;
  update public.visit_entitlements set status = 'reserved' where id = v_ent;
  insert into public.visit_reservations (entitlement_id, appointment_id) values (v_ent, v_appt);

  -- ---- Zainab: expired subscription, missed appointment, pending selection -
  insert into public.subscriptions (customer_id, plan_id, plan_version_id, status, activation_source, home_salon_id)
  values (v_zainab, '55555555-0000-0000-0000-000000000001',
          public.latest_plan_version('55555555-0000-0000-0000-000000000001'), 'expired', 'manual', '77770001-0000-0000-0000-000000000001')
  returning id into v_sub;
  insert into public.subscription_cycles (subscription_id, cycle_number, starts_on, ends_on, visits_included, status)
  values (v_sub, 1, v_today - 45, v_today - 15, 2, 'expired') returning id into v_cycle;
  insert into public.visit_entitlements (cycle_id, seq_number, status) values
    (v_cycle, 1, 'expired'), (v_cycle, 2, 'expired');
  insert into public.appointments (customer_id, subscription_id, cycle_id, service_id, salon_id,
    starts_at, ends_at, duration_minutes, status)
  values (v_zainab, v_sub, v_cycle, '44444444-0000-0000-0000-000000000001', '77770001-0000-0000-0000-000000000001',
    (v_today - 20 + time '10:00') at time zone 'Africa/Lagos',
    (v_today - 20 + time '11:00') at time zone 'Africa/Lagos', 60, 'missed');

  insert into public.pending_plan_selections (customer_id, plan_id, plan_version_id)
  values (v_zainab, '55555555-0000-0000-0000-000000000001',
          public.latest_plan_version('55555555-0000-0000-0000-000000000001'));
  insert into public.pending_payment_intents (purpose, customer_id, pending_selection_id, amount_kobo)
  values ('subscription_activation', v_zainab,
          (select id from public.pending_plan_selections where customer_id = v_zainab and status = 'pending_payment'),
          1500000);

  -- ---- Favourites + retention prompts -------------------------------------
  insert into public.favourites (customer_id, item_type, item_id) values
    (v_maryam, 'product', (select id from public.products where slug = 'leave-in-conditioner')),
    (v_maryam, 'extra_service', '77777777-0000-0000-0000-000000000001'),
    (v_fatima, 'product', (select id from public.products where slug = 'satin-bonnet'));

  perform public.fn_generate_retention_prompts(v_maryam);
  perform public.fn_generate_retention_prompts(v_khadija);
  perform public.fn_generate_retention_prompts(v_fatima);
  perform public.fn_generate_retention_prompts(v_aisha);
  perform public.fn_generate_retention_prompts(v_zainab);
end $seed$;

commit;

-- =========================================================================
-- PHASE 3 SEED: inventory, suppliers, expenses, support chat, capacity.
-- =========================================================================
begin;

insert into public.suppliers (id, name, contact_person, phone, city, state, categories_supplied) values
  ('aaaa1111-0000-0000-0000-000000000001', 'Kwara Beauty Supplies', 'Mallam Ibrahim', '+2348051110001', 'Ilorin', 'Kwara', 'Shampoo, Conditioner, Treatments'),
  ('aaaa1111-0000-0000-0000-000000000002', 'Lagos Hair Depot', 'Mrs Adeyemi', '+2348051110002', 'Lagos', 'Lagos', 'Hair Colouring, Retail Hair Products'),
  ('aaaa1111-0000-0000-0000-000000000003', 'Salon Equipment NG', 'Mr Okafor', '+2348051110003', 'Ibadan', 'Oyo', 'Salon Equipment');

insert into public.supplier_bank_details (supplier_id, bank_details) values
  ('aaaa1111-0000-0000-0000-000000000001', 'GTB 0123456789 — Kwara Beauty Ltd');

do $p3$
declare
  v_org uuid := (select id from public.organisations limit 1);
  v_cat_sh uuid := (select id from public.inventory_categories where slug = 'shampoo');
  v_cat_tr uuid := (select id from public.inventory_categories where slug = 'treatments');
  v_cat_hc uuid := (select id from public.inventory_categories where slug = 'hair-colouring');
  v_cat_be uuid := (select id from public.inventory_categories where slug = 'beads-accessories');
  v_cat_ds uuid := (select id from public.inventory_categories where slug = 'disposable-supplies');
  v_cat_rt uuid := (select id from public.inventory_categories where slug = 'retail-hair-products');
  v_cat_eq uuid := (select id from public.inventory_categories where slug = 'salon-equipment');
  v_sup1 uuid := 'aaaa1111-0000-0000-0000-000000000001';
  v_sup2 uuid := 'aaaa1111-0000-0000-0000-000000000002';
  v_item record;
  v_receipt uuid;
  v_count uuid;
  v_maryam uuid; v_fatima uuid; v_zainab uuid;
  v_conv uuid;
  v_admin uuid := '11111111-0000-0000-0000-000000000001';
  v_stylist uuid := '11111111-0000-0000-0000-000000000002';
  v_cat_id uuid;
begin
  -- Inventory items (fixed UUID prefix bbbb). Low-stock, expiring, out-of-stock included.
  insert into public.inventory_items
    (id, organisation_id, name, sku, item_type, category_id, unit, reorder_level,
     reorder_quantity, cost_price_kobo, selling_price_kobo, supplier_id,
     retail_available, expiry_date) values
    ('bbbb1111-0000-0000-0000-000000000001', v_org, 'Salon Shampoo 5L', 'INV-SH-001', 'consumable', v_cat_sh, 'ml', 2000, 10000, 2, null, v_sup1, false, null),
    ('bbbb1111-0000-0000-0000-000000000002', v_org, 'Salon Conditioner 5L', 'INV-CO-001', 'consumable', v_cat_sh, 'ml', 2000, 10000, 2, null, v_sup1, false, null),
    ('bbbb1111-0000-0000-0000-000000000003', v_org, 'Deep Treatment Tub', 'INV-TR-001', 'consumable', v_cat_tr, 'ml', 1000, 5000, 4, null, v_sup1, false, (now() at time zone 'Africa/Lagos')::date + 14),
    ('bbbb1111-0000-0000-0000-000000000004', v_org, 'Hair Dye Pack', 'INV-HD-001', 'consumable', v_cat_hc, 'pack', 5, 20, 250000, null, v_sup2, false, null),
    ('bbbb1111-0000-0000-0000-000000000005', v_org, 'Henna Powder', 'INV-HN-001', 'consumable', v_cat_hc, 'g', 500, 2000, 30, null, v_sup1, false, null),
    ('bbbb1111-0000-0000-0000-000000000006', v_org, 'Hair Beads', 'INV-BD-001', 'consumable', v_cat_be, 'pack', 10, 30, 50000, null, v_sup2, false, null),
    ('bbbb1111-0000-0000-0000-000000000007', v_org, 'Disposable Gloves', 'INV-GL-001', 'consumable', v_cat_ds, 'pair', 50, 200, 5000, null, v_sup1, false, null),
    ('bbbb1111-0000-0000-0000-000000000008', v_org, 'Nail Polish', 'INV-NP-001', 'consumable', v_cat_be, 'bottle', 5, 12, 80000, null, v_sup2, false, null),
    ('bbbb1111-0000-0000-0000-000000000009', v_org, 'Satin Bonnet (retail)', 'INV-BN-001', 'retail', v_cat_rt, 'piece', 5, 20, 80000, 150000, v_sup2, true, null),
    ('bbbb1111-0000-0000-0000-000000000010', v_org, 'Hair Oil 100ml (retail)', 'INV-OI-001', 'retail', v_cat_rt, 'bottle', 6, 24, 200000, 350000, v_sup2, true, null),
    ('bbbb1111-0000-0000-0000-000000000011', v_org, 'Hair Steamer', 'INV-EQ-001', 'equipment', v_cat_eq, 'piece', 0, 0, 15000000, null, null, false, null),
    ('bbbb1111-0000-0000-0000-000000000012', v_org, 'Hair Dryer', 'INV-EQ-002', 'equipment', v_cat_eq, 'piece', 0, 0, 9000000, null, null, false, null);

  -- Opening stock through the ledger (auth.uid() is null in seed = trusted).
  perform public.fn_post_stock_movement('77770001-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000001', 'opening_stock', 8000, 'opening stock');
  perform public.fn_post_stock_movement('77770001-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000002', 'opening_stock', 6000, 'opening stock');
  perform public.fn_post_stock_movement('77770001-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000003', 'opening_stock', 2500, 'opening stock');
  perform public.fn_post_stock_movement('77770001-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000004', 'opening_stock', 3, 'opening stock');   -- low stock (reorder 5)
  perform public.fn_post_stock_movement('77770001-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000005', 'opening_stock', 1500, 'opening stock');
  perform public.fn_post_stock_movement('77770001-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000006', 'opening_stock', 25, 'opening stock');
  perform public.fn_post_stock_movement('77770001-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000007', 'opening_stock', 120, 'opening stock');
  -- Nail polish left at 0 = out of stock. Retail items:
  perform public.fn_post_stock_movement('77770001-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000009', 'opening_stock', 12, 'opening stock');
  perform public.fn_post_stock_movement('77770001-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000010', 'opening_stock', 18, 'opening stock');

  -- Link retail products to inventory.
  update public.products set inventory_item_id = 'bbbb1111-0000-0000-0000-000000000009'
    where slug = 'satin-bonnet';
  update public.products set inventory_item_id = 'bbbb1111-0000-0000-0000-000000000010'
    where slug = 'nourishing-hair-oil';

  -- A confirmed stock receipt.
  insert into public.stock_receipts (id, salon_id, supplier_id, invoice_number, payment_status, notes)
  values ('cccc1111-0000-0000-0000-000000000001', '77770001-0000-0000-0000-000000000001', v_sup1, 'KBS-2041', 'unpaid', 'Monthly consumables order')
  returning id into v_receipt;
  insert into public.stock_receipt_items (receipt_id, item_id, quantity, unit_cost_kobo) values
    (v_receipt, 'bbbb1111-0000-0000-0000-000000000001', 5000, 2),
    (v_receipt, 'bbbb1111-0000-0000-0000-000000000007', 100, 5000);
  perform public.fn_confirm_stock_receipt(v_receipt);

  -- A submitted stock count with variance (henna shrinkage).
  insert into public.stock_counts (id, salon_id, location, status, started_by, notes)
  values ('cccc2222-0000-0000-0000-000000000001', '77770001-0000-0000-0000-000000000001', 'salon', 'submitted', v_stylist, 'Weekly count')
  returning id into v_count;
  insert into public.stock_count_items (count_id, item_id, system_quantity, counted_quantity, reason) values
    (v_count, 'bbbb1111-0000-0000-0000-000000000005', 1500, 1400, 'spillage during refill');

  -- Consumption templates: wash & deep condition + henna extra.
  insert into public.service_consumption_templates (service_id, item_id, standard_quantity, unit) values
    ('44444444-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000001', 50, 'ml'),
    ('44444444-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000002', 40, 'ml'),
    ('44444444-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000007', 1, 'pair'),
    ('44444444-0000-0000-0000-000000000003', 'bbbb1111-0000-0000-0000-000000000003', 30, 'ml'),
    ('44444444-0000-0000-0000-000000000003', 'bbbb1111-0000-0000-0000-000000000007', 1, 'pair');
  insert into public.service_consumption_templates (extra_service_id, item_id, standard_quantity, unit) values
    ('77777777-0000-0000-0000-000000000001', 'bbbb1111-0000-0000-0000-000000000005', 100, 'g'),
    ('77777777-0000-0000-0000-000000000002', 'bbbb1111-0000-0000-0000-000000000006', 1, 'pack');

  -- Equipment register.
  insert into public.equipment_assets (name, asset_code, category_id, purchase_date, purchase_cost_kobo, supplier_id, condition, maintenance_interval_days, last_maintenance_date) values
    ('Hair Steamer A', 'EQ-0001', v_cat_eq, current_date - 200, 15000000, 'aaaa1111-0000-0000-0000-000000000003', 'good', 90, current_date - 80),
    ('Hair Dryer 1', 'EQ-0002', v_cat_eq, current_date - 400, 9000000, 'aaaa1111-0000-0000-0000-000000000003', 'needs_repair', 90, current_date - 100);

  -- Expenses in each state + recurring template.
  select id into v_cat_id from public.expense_categories where name = 'Rent';
  insert into public.expenses (organisation_id, salon_id, expense_date, amount_kobo, category_id, description, payee, status, entered_by, approved_by, approved_at, paid_at) values
    (v_org, '77770001-0000-0000-0000-000000000001', date_trunc('month', now())::date, 25000000, v_cat_id, 'Monthly salon rent', 'Landlord', 'paid', v_admin, v_admin, now(), now());
  select id into v_cat_id from public.expense_categories where name = 'Electricity';
  insert into public.expenses (organisation_id, salon_id, expense_date, amount_kobo, category_id, description, payee, status, entered_by, approved_by, approved_at) values
    (v_org, '77770001-0000-0000-0000-000000000001', current_date - 3, 4500000, v_cat_id, 'IBEDC bill', 'IBEDC', 'approved', v_stylist, v_admin, now());
  select id into v_cat_id from public.expense_categories where name = 'Fuel';
  insert into public.expenses (organisation_id, salon_id, expense_date, amount_kobo, category_id, description, payee, status, entered_by) values
    (v_org, '77770001-0000-0000-0000-000000000001', current_date - 1, 1500000, v_cat_id, 'Generator fuel', 'Total station', 'pending_approval', v_stylist);
  select id into v_cat_id from public.expense_categories where name = 'Marketing';
  insert into public.expenses (organisation_id, salon_id, expense_date, amount_kobo, category_id, description, payee, status, entered_by) values
    (v_org, '77770001-0000-0000-0000-000000000001', current_date, 800000, v_cat_id, 'Instagram promotion', 'Meta', 'draft', v_admin);
  select id into v_cat_id from public.expense_categories where name = 'Inventory Purchases';
  insert into public.expenses (organisation_id, expense_date, amount_kobo, category_id, description, payee, supplier_id, stock_receipt_id, status, entered_by, approved_by, approved_at) values
    (v_org, current_date - 2, 1010000, v_cat_id, 'Consumables restock KBS-2041', 'Kwara Beauty Supplies', v_sup1, v_receipt, 'approved', v_admin, v_stylist, now());
  select id into v_cat_id from public.expense_categories where name = 'Software Subscriptions';
  insert into public.recurring_expense_templates (category_id, description, amount_kobo, frequency, start_date, next_due_date, vendor) values
    (v_cat_id, 'Booking platform hosting', 2000000, 'monthly', current_date, current_date, 'Vercel/Supabase');

  -- Support conversations.
  select cp.id into v_maryam from public.customer_profiles cp join public.profiles p on p.id = cp.profile_id where p.email = 'maryam@customer.test';
  select cp.id into v_fatima from public.customer_profiles cp join public.profiles p on p.id = cp.profile_id where p.email = 'fatima@customer.test';
  select cp.id into v_zainab from public.customer_profiles cp join public.profiles p on p.id = cp.profile_id where p.email = 'zainab@customer.test';

  insert into public.support_conversations (id, customer_id, subject, topic, status, priority)
  values ('dddd1111-0000-0000-0000-000000000001', v_maryam, 'Can I move my Saturday visit?', 'booking', 'waiting_salon', 'normal')
  returning id into v_conv;
  insert into public.support_messages (conversation_id, sender_profile_id, sender_type, body) values
    (v_conv, '11111111-0000-0000-0000-000000000003', 'customer', 'Assalamu alaikum! Something came up on Saturday — can I move my visit to Sunday or Monday?');

  insert into public.support_conversations (id, customer_id, subject, topic, status, priority, assigned_staff_id)
  values ('dddd1111-0000-0000-0000-000000000002', v_zainab, 'Charged wrongly at my last visit', 'complaint', 'assigned', 'urgent', v_admin)
  returning id into v_conv;
  insert into public.support_messages (conversation_id, sender_profile_id, sender_type, body) values
    (v_conv, '11111111-0000-0000-0000-000000000007', 'customer', 'I was asked to pay for a treatment that should be in my plan. Please check.');
  insert into public.support_messages (conversation_id, sender_profile_id, sender_type, body, is_internal_note) values
    (v_conv, v_admin, 'staff', 'Checked her plan version — treatment IS included. Refund the ₦2,000 at next visit.', true);

  insert into public.support_conversations (id, customer_id, subject, topic, status, priority)
  values ('dddd1111-0000-0000-0000-000000000003', v_fatima, 'Which oil is best for my daughter?', 'products', 'resolved', 'low')
  returning id into v_conv;
  insert into public.support_messages (conversation_id, sender_profile_id, sender_type, body) values
    (v_conv, '11111111-0000-0000-0000-000000000005', 'customer', 'Looking for a light oil for kids.');
  insert into public.support_messages (conversation_id, sender_profile_id, sender_type, body) values
    (v_conv, v_admin, 'staff', 'Wa alaikum salaam! Our Hair Oil 100ml is light and child-safe — I can set one aside for your next visit.');
  update public.support_conversations set status = 'resolved', resolved_at = now()
    where id = 'dddd1111-0000-0000-0000-000000000003';

  -- Capacity: make the Kids plan near its limit.
  update public.subscription_plans set subscriber_limit = 3
    where id = '55555555-0000-0000-0000-000000000005';
end $p3$;

commit;

-- ============================================================================
-- v3 SEED — SALONS (Session A)
-- Ilorin (open) is created by migration 0019 and every pre-existing row is
-- backfilled onto it. Here: the Abuja expansion salon on the waitlist, with
-- early signups captured per city (v3 §3.3).
-- ============================================================================
insert into public.staff_salon_assignments (profile_id, salon_id, is_primary)
select p.id, '77770001-0000-0000-0000-000000000001', true
from public.profiles p where p.role in ('staff', 'admin')
on conflict (profile_id, salon_id) do nothing;

insert into public.salons
  (id, name, slug, city, state, address, chair_capacity, status, launch_date)
values
  ('77770001-0000-0000-0000-000000000002', 'Sisters Lounge Salon Abuja',
   'abuja', 'Abuja', 'FCT', 'Wuse II, Abuja', 4, 'waitlist',
   (now() at time zone 'Africa/Lagos')::date + 90)
on conflict (id) do nothing;

insert into public.city_waitlist (city, salon_id, full_name, contact, contact_type) values
  ('Abuja', '77770001-0000-0000-0000-000000000002', 'Hauwa Sule',
   '+2348011112222', 'whatsapp'),
  ('Abuja', '77770001-0000-0000-0000-000000000002', 'Rukayat Bello',
   'rukayat@example.test', 'email'),
  ('Lagos', null, 'Amina Yusuf', '+2348033334444', 'whatsapp')
on conflict (city, contact) do nothing;
