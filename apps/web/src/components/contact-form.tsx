"use client";

import { CheckCircle2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";

import { submitContact } from "@/lib/api/contact";
import { ApiError } from "@/types/api";

interface ContactFormProps {
  /** De qué CTA vino el visitante (hero, header, footer, cierre) — viaja
   *  tal cual al backend como ContactSubmission.source. */
  source?: string;
}

/**
 * El único estado de "enviado" que existe acá es el que llega DESPUÉS de
 * que POST /api/v1/contact responda 201 — nunca antes. Un 429 (rate limit)
 * o 422 (validación) muestran el error real del backend, nunca un éxito
 * fingido. El campo `company` (honeypot) está oculto de un visitante real
 * vía CSS + fuera del árbol de accesibilidad (aria-hidden, tabIndex=-1) —
 * un bot que rellena todos los inputs de un formulario sin mirar lo llena,
 * un humano nunca lo ve ni lo tabula.
 */
export function ContactForm({ source }: ContactFormProps) {
  const t = useTranslations("legalMarketing.contactForm");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      await submitContact({
        full_name: fullName,
        email,
        company_name: companyName || undefined,
        phone: phone || undefined,
        message,
        source,
        honeypot: honeypot || undefined,
      });
      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(err instanceof ApiError ? err.message : t("genericError"));
    }
  }

  if (status === "success") {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center" role="status">
        <CheckCircle2 className="size-10 text-[var(--color-chart-4)]" />
        <h2 className="text-lg font-semibold">{t("successTitle")}</h2>
        <p className="bee-caption max-w-xs">{t("successBody")}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="fullName" className="bee-caption block">
            {t("fullNameLabel")}
          </label>
          <input
            id="fullName"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="bee-input"
            placeholder={t("fullNamePlaceholder")}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="email" className="bee-caption block">
            {t("emailLabel")}
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="bee-input"
            placeholder={t("emailPlaceholder")}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="companyName" className="bee-caption block">
            {t("companyLabel")} <span className="text-muted-foreground">{t("optional")}</span>
          </label>
          <input
            id="companyName"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="bee-input"
            placeholder={t("companyPlaceholder")}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="phone" className="bee-caption block">
            {t("phoneLabel")} <span className="text-muted-foreground">{t("optional")}</span>
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="bee-input"
            placeholder={t("phonePlaceholder")}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="message" className="bee-caption block">
          {t("messageLabel")}
        </label>
        <textarea
          id="message"
          required
          minLength={10}
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("messagePlaceholder")}
          className="w-full resize-y rounded-[var(--radius-sm)] border border-[var(--color-divider)] bg-background px-2 py-2 font-[var(--bee-font)] text-xs text-[var(--color-text)] focus:border-[var(--color-chart-4)] focus:outline-none"
        />
      </div>

      {/* Honeypot — invisible y fuera del árbol de accesibilidad para un
       * visitante real; un bot que completa cada input del formulario sin
       * discriminar lo llena igual. */}
      <div className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
        <label htmlFor="company">{t("honeypotLabel")}</label>
        <input
          id="company"
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      {status === "error" && error && (
        <p className="text-xs text-[var(--color-chart-2)]" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="bee-btn bee-btn--primary w-full"
      >
        {status === "submitting" ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
