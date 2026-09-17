// src/app/login/page.tsx
import Link from "next/link";
import { Fingerprint, Gamepad2 } from "lucide-react";
import { signIn } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string }>;
}) {
  const { error, created } = await searchParams;

  return (
    <div className="header">
      di
    </div>
  );
}
