import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import ProfileClient from "@/components/ProfileClient";

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect("/login");
  return <ProfileClient session={session} />;
}
