import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default("http://localhost:8000"),
  NEXT_PUBLIC_BEE_API_KEY: z.string().optional(),
});

export type PublicEnv = z.infer<typeof envSchema>;

/** Validated public environment (browser-safe). */
export function getPublicEnv(): PublicEnv {
  return envSchema.parse({
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_BEE_API_KEY: process.env.NEXT_PUBLIC_BEE_API_KEY,
  });
}
