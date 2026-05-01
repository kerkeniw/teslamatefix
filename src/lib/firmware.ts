/**
 * Construit l'URL de release notes pour une version firmware Tesla.
 * Le slug accepté par notateslaapp.com est la version brute (ex. "2026.8.6").
 */
export function buildReleaseNotesUrl(version: string): string {
  const slug = encodeURIComponent(version.trim());
  return `https://www.notateslaapp.com/software-updates/version/${slug}/release-notes`;
}
