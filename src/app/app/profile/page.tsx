import type { Metadata } from "next";
import { requireCustomer } from "@/server/auth";
import { getSchedulingInfo } from "@/server/customer";
import { profileCompletion } from "@/lib/booking-rules";
import { ProfileForm } from "@/components/profile-form";
import { Card } from "@/components/ui";

export const metadata: Metadata = { title: "My Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await requireCustomer();
  const scheduling = await getSchedulingInfo();
  const completion = profileCompletion({
    full_name: session.profile.full_name,
    phone: session.profile.phone,
    whatsapp_number: session.customerProfile.whatsapp_number,
    address: session.customerProfile.address,
    city: session.customerProfile.city,
    state: session.customerProfile.state,
    service_area_confirmed: session.customerProfile.service_area_confirmed,
  });

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="heading-rule font-display text-2xl text-ink">My Profile</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Keep your details current so booking and home service work smoothly.
        </p>
      </div>
      {!completion.complete && (
        <Card className="border-gold-300 bg-gold-100/50">
          <p className="text-sm">
            <strong>{completion.missing.length} item{completion.missing.length > 1 ? "s" : ""} left before you can book:</strong>{" "}
            {completion.missing.join(", ")}.
          </p>
        </Card>
      )}
      <ProfileForm
        profile={session.profile}
        customerProfile={session.customerProfile}
        serviceAreas={scheduling?.supportedServiceAreas ?? ["ilorin"]}
      />
    </div>
  );
}
