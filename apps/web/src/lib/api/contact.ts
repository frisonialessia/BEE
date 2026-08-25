import { apiFetch } from "@/lib/api/client";

/**
 * Cliente del único endpoint público sin auth de esta API — ver
 * apps/api/app/api/v1/endpoints/contact.py. `honeypot` viaja siempre
 * (vacío para un visitante real; el input que lo llena está oculto del
 * formulario visible, ver ContactForm) y `source` deja registrado desde
 * qué CTA de la landing llegó el envío.
 */
export interface ContactSubmissionInput {
  full_name: string;
  email: string;
  company_name?: string;
  phone?: string;
  message: string;
  source?: string;
  honeypot?: string;
}

export interface ContactSubmissionResult {
  id: string;
  created_at: string;
}

/**
 * El estado de éxito en la página SOLO debe mostrarse después de que esto
 * resuelva — nunca de forma optimista. Un 429 (rate limit) o 422
 * (validación) llegan como ApiError, que el caller debe capturar y
 * mostrar tal cual: `error.message` ya trae el texto en español que
 * devuelve el backend.
 */
export async function submitContact(
  input: ContactSubmissionInput,
): Promise<ContactSubmissionResult> {
  return apiFetch<ContactSubmissionResult>("/api/v1/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
