"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import {
  getCurrentPasswordHash,
  isPasswordChangeRequired,
  persistPasswordHash,
  requireSession,
} from "@/lib/auth";
import { hashPassword } from "@/lib/hash";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

export type ChangePasswordState = {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
};

// Politique de mot de passe : raisonnable pour un single-user en intranet,
// volontairement légère pour ne pas frustrer le grand public.
//   - longueur >= 12 caractères
//   - au moins 1 lettre ET 1 chiffre
const HAS_LETTER = /[A-Za-z]/;
const HAS_DIGIT = /\d/;

const ChangePasswordSchema = z
  .object({
    current_password: z.string().min(1, "currentPasswordIncorrect").max(256),
    new_password: z
      .string()
      .min(12, "tooShort")
      .max(256)
      .refine((v) => HAS_LETTER.test(v) && HAS_DIGIT.test(v), {
        message: "tooSimple",
      }),
    confirm_password: z.string().min(1).max(256),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    path: ["confirm_password"],
    message: "passwordMismatch",
  });

function feFromZod(err: z.ZodError): Record<string, string> {
  const fe: Record<string, string> = {};
  for (const issue of err.issues) {
    const path = issue.path[0];
    if (typeof path === "string" && !fe[path]) {
      fe[path] = issue.message;
    }
  }
  return fe;
}

export async function changePasswordAction(
  _prev: ChangePasswordState | null,
  formData: FormData,
): Promise<ChangePasswordState> {
  // skipPasswordChangeRedirect : sans ça, requireSession() détecterait le
  // flag force_password_change et redirigerait l'action vers /change-password
  // AVANT d'écrire le nouveau hash. C'est exactement cette action qui doit
  // pouvoir lever le flag, donc on doit court-circuiter la garde.
  const session = await requireSession({ skipPasswordChangeRedirect: true });
  if (env.READ_ONLY) {
    return { ok: false, error: "Application en lecture seule." };
  }

  // Mode legacy : si AUTH_PASSWORD_HASH est défini en env, on ne peut pas
  // muter le hash (l'env serait re-imposée au prochain démarrage).
  if (process.env.AUTH_PASSWORD_HASH && process.env.AUTH_PASSWORD_HASH.trim() !== "") {
    return { ok: false, error: "envLocked" };
  }

  const raw = {
    current_password: String(formData.get("current_password") ?? ""),
    new_password: String(formData.get("new_password") ?? ""),
    confirm_password: String(formData.get("confirm_password") ?? ""),
  };
  const parsed = ChangePasswordSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, fieldErrors: feFromZod(parsed.error) };
  }

  const currentHash = getCurrentPasswordHash();
  const ok = await bcrypt.compare(parsed.data.current_password, currentHash);
  if (!ok) {
    return {
      ok: false,
      fieldErrors: { current_password: "currentPasswordIncorrect" },
    };
  }

  const newHash = await hashPassword(parsed.data.new_password);
  try {
    persistPasswordHash(newHash);
  } catch (e) {
    logger.error(
      { event: "auth.changePassword.persistError", err: String(e) },
      "persist password hash failed",
    );
    return { ok: false, error: "Une erreur est survenue." };
  }

  // Sanity-check : après écriture, le force-change est levé.
  const stillForced = isPasswordChangeRequired();
  logger.info(
    {
      event: "auth.changePassword",
      user: session.userId,
      stillForced,
    },
    "password changed",
  );

  // L'utilisateur reste connecté (le cookie session est toujours valide ;
  // le nouveau hash sert pour la PROCHAINE connexion). Redirection vers
  // l'accueil.
  redirect("/");
}
