import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import Dashboard from "@/components/Dashboard";

export default async function Home() {
  const session = await auth();

  if (!session) {
    redirect("/login");
  }

  return <Dashboard session={session} />;
}
