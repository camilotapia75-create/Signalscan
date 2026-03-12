import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import AdminDashboard from "@/components/AdminDashboard";

export default async function AdminPage() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  const isAdmin = (session.user as { isAdmin?: boolean })?.isAdmin;
  if (!isAdmin) {
    redirect("/");
  }

  return <AdminDashboard session={session} />;
}
