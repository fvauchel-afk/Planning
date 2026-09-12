import { CHANGELOG, type ChangelogEntry } from "@/data/changelog";

export type BackupTrigger = "deploy" | "daily" | "manual";

export type BackupFileInfo = {
  trigger: BackupTrigger | null;
  buildId: string | null;
  changelogId: string | null;
  changelogTitle: string | null;
  kindLabel: string;
};

/** `sauvegarde__deploy__<build>__<changelogId>.json` */
export function parseBackupFileName(
  name: string,
  changelog: ChangelogEntry[] = CHANGELOG,
): BackupFileInfo {
  const base = name.replace(/\.json$/i, "");
  const deploy = base.match(/__deploy__([a-z0-9]+)(?:__(.+))?$/i);
  if (deploy) {
    const changelogId = deploy[2] ?? null;
    const entry = changelog.find((item) => item.id === changelogId) ?? null;
    return {
      trigger: "deploy",
      buildId: deploy[1] ?? null,
      changelogId,
      changelogTitle: entry?.title ?? null,
      kindLabel: entry
        ? `État des données juste avant : ${entry.title}`
        : "État des données juste avant une mise à jour",
    };
  }
  if (/__quotidienne$/i.test(base)) {
    return {
      trigger: "daily",
      buildId: null,
      changelogId: null,
      changelogTitle: null,
      kindLabel: "Copie automatique du jour",
    };
  }
  if (/__manuelle$/i.test(base)) {
    return {
      trigger: "manual",
      buildId: null,
      changelogId: null,
      changelogTitle: null,
      kindLabel: "Copie manuelle",
    };
  }
  return {
    trigger: null,
    buildId: null,
    changelogId: null,
    changelogTitle: null,
    kindLabel: "Sauvegarde",
  };
}

export function latestChangelog(): ChangelogEntry | null {
  return CHANGELOG[0] ?? null;
}
