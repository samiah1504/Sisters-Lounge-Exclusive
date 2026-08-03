/** Domain row shapes (hand-maintained; regenerate from Supabase in CI later). */

export type Role = "customer" | "staff" | "admin";

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
}

export interface CustomerProfile {
  id: string;
  profile_id: string;
  whatsapp_number: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  preferred_contact_method: "phone" | "whatsapp" | "email";
  marketing_consent: boolean;
  notification_preferences: Record<string, boolean>;
  account_status: "active" | "suspended" | "archived";
}

export interface Child {
  id: string;
  customer_id: string;
  full_name: string;
  date_of_birth: string;
  gender: "female" | "male" | null;
  photo_url: string | null;
  allergies: string;
  sensitivities: string;
  hair_scalp_notes: string;
  service_notes: string;
  is_active: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionCategory {
  id: string;
  name: string;
  slug: string;
  short_description: string;
  full_description: string;
  image_url: string | null;
  display_order: number;
  is_active: boolean;
  is_public: boolean;
  eligibility_notes: string;
  archived_at: string | null;
}

export interface Service {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  estimated_duration_minutes: number;
  is_active: boolean;
  eligible_age_group: "all" | "adults" | "children";
  required_skill: string | null;
  image_url: string | null;
  display_order: number;
}

export type PlanStatus = "draft" | "active" | "hidden" | "closed" | "archived";

export interface SubscriptionPlan {
  id: string;
  organisation_id: string;
  category_id: string;
  name: string;
  slug: string;
  plan_code: string;
  tier_label: string;
  short_description: string;
  full_description: string;
  monthly_price_kobo: number;
  currency: "NGN";
  visits_included: number;
  min_visit_interval_days: number;
  eligible_age_group: "all" | "adults" | "children";
  eligibility_notes: string;
  available_days: number[];
  is_featured: boolean;
  is_public: boolean;
  display_order: number;
  subscriber_limit: number | null;
  status: PlanStatus;
  image_url: string | null;
  terms: string;
  archived_at: string | null;
}

export interface ExtraService {
  id: string;
  name: string;
  slug: string;
  description: string;
  short_description: string;
  price_kobo: number;
  estimated_duration_minutes: number;
  category_id: string | null;
  image_url: string | null;
  is_active: boolean;
  is_public: boolean;
  is_featured: boolean;
  required_skill: string | null;
  min_advance_notice_hours: number;
  payment_requirement: "pay_before_confirmation" | "pay_at_salon" | "admin_decides";
  display_order: number;
  archived_at: string | null;
}

export type SubscriptionStatus =
  | "draft" | "pending_payment" | "active" | "expiring_soon" | "renewal_due"
  | "payment_failed" | "expired" | "opted_out" | "suspended"
  | "cancelled_by_admin" | "archived";

export interface Subscription {
  id: string;
  customer_id: string;
  child_id: string | null;
  plan_id: string;
  plan_version_id: string;
  status: SubscriptionStatus;
  opt_out_next_renewal: boolean;
  /** Salon chosen at signup — attribution and defaults only, never a restriction. */
  home_salon_id: string;
  created_at: string;
}

export interface SubscriptionCycle {
  id: string;
  subscription_id: string;
  cycle_number: number;
  starts_on: string;
  ends_on: string;
  visits_included: number;
  status: "upcoming" | "active" | "completed" | "expired";
}

export interface VisitEntitlement {
  id: string;
  cycle_id: string;
  seq_number: number;
  status: "available" | "reserved" | "consumed" | "expired" | "revoked";
}

export type AppointmentStatus =
  | "draft" | "pending_addon_payment" | "pending_confirmation" | "confirmed"
  | "assigned" | "arrived" | "in_service" | "completed" | "rescheduled"
  | "missed" | "cancelled_salon" | "cancelled_admin" | "no_longer_eligible"
  | "expired";

export interface Appointment {
  id: string;
  customer_id: string;
  child_id: string | null;
  subscription_id: string | null;
  cycle_id: string | null;
  service_id: string;
  salon_id: string;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  status: AppointmentStatus;
  stylist_profile_id: string | null;
  customer_notes: string;
  addon_total_kobo: number;
  completed_at: string | null;
  created_at: string;
}

export interface ConsultationType {
  id: string;
  name: string;
  slug: string;
  short_description: string;
  full_description: string;
  price_kobo: number;
  duration_minutes: number;
  location_type: "salon" | "virtual";
  subscriber_only: boolean;
  non_subscriber_available: boolean;
  subscriber_discount_kobo: number;
  is_active: boolean;
  image_url: string | null;
  display_order: number;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  sku: string;
  short_description: string;
  full_description: string;
  category_id: string | null;
  price_kobo: number;
  subscriber_price_kobo: number | null;
  images: string[];
  stock_status: "in_stock" | "low_stock" | "out_of_stock";
  inventory_item_id: string | null;
  is_active: boolean;
  is_featured: boolean;
  age_suitability: "all" | "adults" | "children";
  hair_type_suitability: string;
  usage_instructions: string;
  ingredients: string;
  warnings: string;
  display_order: number;
  archived_at: string | null;
}

export interface RetentionPrompt {
  id: string;
  customer_id: string;
  prompt_key: string;
  prompt_type: "info" | "action_required" | "urgent" | "success" | "re_engagement";
  title: string;
  message: string;
  priority: number;
  action_label: string | null;
  action_url: string | null;
  dismissible: boolean;
  dismissed_at: string | null;
  seen_at: string | null;
}

export interface PendingPlanSelection {
  id: string;
  customer_id: string;
  child_id: string | null;
  plan_id: string;
  plan_version_id: string;
  status: "pending_payment" | "superseded" | "cancelled" | "activated";
  created_at: string;
}
