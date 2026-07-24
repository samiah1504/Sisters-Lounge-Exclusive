import { redirect } from "next/navigation";

/**
 * Staff land on the bookings workspace. Staff share the admin bookings UI;
 * database permissions (role_permissions) limit what they can actually do —
 * catalogue and settings pages require the admin role.
 */
export default function StaffPage() {
  redirect("/staff/bookings");
}
