"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { getApiBaseUrl } from "@/lib/api/client";

/**
 * The landing's primary call to action. Replaced "Crear cuenta" while
 * signup is closed.
 *
 * Why a waitlist and not a signup: `POST /auth/register` issues a session
 * token immediately and there is no email verification anywhere in the
 * project yet, while emails are globally unique. So a stranger registering
 * with someone else's corporate address both impersonates that company and
 * permanently denies the real owner the account. A waiting list creates no
 * account, so none of that is reachable — and it is the more honest ask for
 * a product that is not open yet.
 *
 * It posts to `POST /api/v1/contact`, the endpoint the /contacto page
 * already uses, rather than a new one: that endpoint is already public,
 * honeypot-guarded, per-IP rate limited, and — the part that matters —
 * persists every submission unconditionally before anything else happens.
 * `source` is what separates these rows from contact-page messages.
 *
 * The success state only appears after the API confirms the write. Never
 * optimistically: telling someone they are on a list they are not on is the
 * same class of lie as a password-reset mail that is never sent.
 */
export function WaitlistForm() {
  const t = useTranslations("marketing.landing.signup");
  const [email, setEmail] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending");
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/v1/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "waitlist_hero", honeypot: honeypot || undefined }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      // Offline, DNS, CORS — anything. The person sees one honest failure
      // message and their address stays in the field so retrying is one tap.
      setState("error");
    }
  }

  if (state === "done") {
    return (
      <p
        role="status"
        className="mt-5 w-full max-w-md rounded-xl border border-[var(--color-divider)] bg-[var(--color-card)] px-4 py-3 text-sm sm:mt-7"
      >
        {t("success")}
      </p>
    );
  }

  return (
    <div className="mt-5 w-full max-w-md sm:mt-7">
    <form
      id="waitlist"
      onSubmit={onSubmit}
      className="flex w-full scroll-mt-24 flex-col gap-2 sm:flex-row sm:gap-2"
    >
      <label htmlFor="hero-email" className="sr-only">
        {t("emailLabel")}
      </label>
      {/* Hidden from real visitors, filled by bots that fill everything —
          the server treats a filled value as spam and answers a fake
          success. Not `type="hidden"`: those get skipped by most bots. */}
      <input
        type="text"
        name="company_website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        value={honeypot}
        onChange={(e) => setHoneypot(e.target.value)}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
      />
      {/* See page.tsx's own note on why the height is inline: .bee-input is
          the compact tier and sits one size below .bee-btn's primary tier,
          and flex-1's flex-basis:0% would govern height in the mobile
          flex-col layout. */}
      <input
        id="hero-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder={t("placeholder")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="bee-input sm:flex-1"
        style={{ height: "var(--bee-control-h-primary)" }}
      />
      <button
        type="submit"
        disabled={state === "sending"}
        className="bee-btn bee-btn--primary bee-cta-lift shrink-0 justify-center"
      >
        {state === "sending" ? t("sending") : t("cta")}
      </button>
    </form>
    {/* Outside the form: inside it, the sm:flex-row layout would push the
        message onto the same line as the field and the button. */}
    {state === "error" && (
      <p role="alert" className="bee-micro mt-2 text-[var(--color-chart-2)]">
        {t("error")}
      </p>
    )}
    </div>
  );
}
