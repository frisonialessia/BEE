"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Logo } from "@/components/logo";
import { useAuth } from "@/providers/auth-provider";
import { ApiError } from "@/types/api";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ email, password });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>

        <div className="bee-bento bee-bento-pad-lg">
          <p className="bee-eyebrow">Bienvenido de nuevo</p>
          <h1 className="mt-1 text-lg font-semibold">Iniciar sesión</h1>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="bee-caption block">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bee-input"
                placeholder="vos@empresa.com"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="bee-caption block">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bee-input"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-xs text-[var(--color-chart-2)]" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="bee-btn bee-btn--dark w-full"
            >
              {isSubmitting ? "Ingresando…" : "Ingresar"}
            </button>
          </form>
        </div>

        <p className="bee-caption mt-6 text-center">
          ¿Todavía no tenés una organización?{" "}
          <Link href="/register" className="font-medium text-foreground underline underline-offset-4">
            Creá una
          </Link>
        </p>
      </div>
    </div>
  );
}
