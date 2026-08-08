import { redirect } from "next/navigation";

/**
 * Membership-first (payments spec §5, §13): there is no standalone
 * registration — account creation happens inside membership checkout.
 * Anyone landing here is sent to choose a membership.
 */
export default function RegisterPage() {
  redirect("/plans");
}
