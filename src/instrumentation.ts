/**
 * Démarrage du serveur : journalise une fois les capacités TeslaMateAPI
 * (`teslamateapi.detected`). Non bloquant — une base injoignable ne doit pas
 * retarder ni empêcher le démarrage (TeslaMateAPI reste facultatif).
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  void import("@/lib/teslamateapi/capabilities")
    .then((m) => m.getTeslaMateApiCapabilities())
    .catch(() => undefined);
}
