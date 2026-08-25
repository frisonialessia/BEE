"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { Logo } from "@/components/logo";
import { useAuth } from "@/providers/auth-provider";
import { ApiError } from "@/types/api";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [organizationName, setOrganizationName] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await register({
        organization_name: organizationName,
        full_name: fullName,
        email,
        password,
      });
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la organización.");
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
          <p className="bee-eyebrow">Empieza gratis</p>
          <h1 className="mt-1 text-lg font-semibold">Crea tu organización</h1>
          <p className="bee-caption mt-1">
            Vas a quedar como Owner — desde ahí invitas al resto del equipo.
          </p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="organizationName" className="bee-caption block">
                Nombre de la organización
              </label>
              <input
                id="organizationName"
                required
                minLength={2}
                value={organizationName}
                onChange={(e) => setOrganizationName(e.target.value)}
                className="bee-input"
                placeholder="Acme Inc"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="fullName" className="bee-caption block">
                Tu nombre
              </label>
              <input
                id="fullName"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="bee-input"
                placeholder="Alice Owner"
              />
            </div>

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
                placeholder="tu@empresa.com"
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
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bee-input"
                placeholder="Mínimo 8 caracteres"
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
              className="bee-btn bee-btn--primary w-full"
            >
              {isSubmitting ? "Creando…" : "Crear organización"}
            </button>
          </form>
        </div>

        <p className="bee-caption mt-6 text-center">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}
