import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:8000"),
  NEXT_PUBLIC_BEE_API_KEY: z.string().optional(),
});

export type PublicEnv = z.infer<typeof envSchema>;

/** Validated public environment (browser-safe).
 *
 * Stays a plain, never-throwing default: this is called from module-level
 * code in several places (e.g. `lib/api.ts`'s `const API_URL =
 * getApiBaseUrl()`) and from components that merely build a display URL
 * (a docs link in the footer) — code paths the sandbox (`/probar`, which
 * deliberately never calls the real API — see `lib/demo/mode.ts`) still
 * evaluates on every page load regardless of whether a real API call is
 * ever made. Throwing here previously took down the entire app, sandbox
 * included, on any deploy that has no reason to configure a real API URL.
 * The actual "don't silently talk to localhost from a real visitor's
 * browser" protection belongs — and now lives — at the one place that
 * matters: immediately before `apiFetch` performs a live request (see
 * `lib/api/client.ts`), which the sandbox never reaches in the first place.
 */
export function getPublicEnv(): PublicEnv {
  return envSchema.parse({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_BEE_API_KEY: process.env.NEXT_PUBLIC_BEE_API_KEY,
  });
}
