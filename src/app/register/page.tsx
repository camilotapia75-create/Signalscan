import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import RegisterForm from "@/components/RegisterForm";

export default async function RegisterPage() {
  const session = await auth();

  if (session) {
    redirect("/");
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: "linear-gradient(135deg, #9333ea 0%, #ec4899 50%, #f97316 100%)",
      }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">💰 Ad Lottery</h1>
          <p className="text-white/80">Create your account to start winning!</p>
        </div>
        <RegisterForm />
      </div>
    </div>
  );
}
