import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:8000"),
  NEXT_PUBLIC_BEE_API_KEY: z.string().optional(),
});

export type PublicEnv = z.infer<typeof envSchema>;

/** Validated public environment (browser-safe).
 *
 * NEXT_PUBLIC_API_URL falling back to localhost:8000 is a real convenience
 * in development — `pnpm dev` works with zero .env.local setup against a
 * locally running API. Keeping that same silent fallback in a production
 * build would mean every apiFetch() call from a real visitor's browser
 * targets localhost:8000 — which can't reach the real API, and (worse)
 * would happily talk to anything the *visitor's own machine* happens to
 * have listening on that port. Fail loudly instead of shipping that.
 */
export function getPublicEnv(): PublicEnv {
  if (process.env.NODE_ENV === "production" && !process.env.NEXT_PUBLIC_API_URL) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Configure it in the production environment " +
        "(e.g. Vercel project settings) — it cannot silently default to localhost:8000 " +
        "outside of local development.",
    );
  }
  return envSchema.parse({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_BEE_API_KEY: process.env.NEXT_PUBLIC_BEE_API_KEY,
  });
}
