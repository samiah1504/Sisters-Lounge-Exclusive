import { requireAdmin } from "@/server/auth";
import { signOut } from "@/server/actions/auth";
import { AdminShell } from "@/components/admin/admin-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireAdmin();
  return (
    <AdminShell
      user={{
        name: session.profile.full_name || session.profile.email || "Admin",
        role: session.profile.role,
      }}
      signOut={signOut}
    >
      {children}
    </AdminShell>
  );
}
