import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const MAX_PREFS_BYTES = 16 * 1024 * 1024;
const READ_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const TOKEN_PREF_PATTERN = /user_pref\(\s*["']extensions\.zotero\.inspiremeta\.external_read_token["']\s*,\s*["']([A-Za-z0-9_-]{43})["']\s*\);/g;

type ProfileSection = {
  path?: string;
  isRelative?: boolean;
  isDefault?: boolean;
};

function getZoteroBases(): string[] {
  const homeDirectory = os.homedir();
  if (process.platform === "darwin") {
    return [path.join(homeDirectory, "Library", "Application Support", "Zotero")];
  }
  if (process.platform === "win32") {
    const appData = process.env.APPDATA || path.join(homeDirectory, "AppData", "Roaming");
    return [path.join(appData, "Zotero", "Zotero")];
  }

  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(homeDirectory, ".config");
  return [
    path.join(homeDirectory, ".zotero", "zotero"),
    path.join(xdgConfig, "zotero"),
    path.join(homeDirectory, ".var", "app", "org.zotero.Zotero", "config", "zotero"),
  ];
}

function parseProfilesIni(content: string, baseDirectory: string): string[] {
  const sections: ProfileSection[] = [];
  let current: ProfileSection | undefined;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^\[Profile\d+\]$/i.test(line)) {
      current = {};
      sections.push(current);
      continue;
    }
    if (!current || line === "" || line.startsWith(";") || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator < 0) {
      continue;
    }
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === "path") {
      current.path = value;
    } else if (key === "isrelative") {
      current.isRelative = value === "1";
    } else if (key === "default") {
      current.isDefault = value === "1";
    }
  }

  return sections
    .filter((section) => section.path)
    .sort((left, right) => Number(Boolean(right.isDefault)) - Number(Boolean(left.isDefault)))
    .map((section) =>
      section.isRelative === false
        ? path.resolve(section.path as string)
        : path.resolve(baseDirectory, section.path as string)
    );
}

async function readTextFile(filePath: string, maxBytes: number): Promise<string | undefined> {
  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile() || stat.size > maxBytes) {
      return undefined;
    }
    return await fs.promises.readFile(filePath, "utf8");
  } catch (_error) {
    return undefined;
  }
}

async function discoverProfileDirectories(baseDirectory: string): Promise<string[]> {
  const directories: string[] = [];
  const profilesIni = await readTextFile(path.join(baseDirectory, "profiles.ini"), 1024 * 1024);
  if (profilesIni) {
    directories.push(...parseProfilesIni(profilesIni, baseDirectory));
  }

  try {
    const profilesDirectory = path.join(baseDirectory, "Profiles");
    const children = await fs.promises.readdir(profilesDirectory, { withFileTypes: true });
    children
      .filter((entry) => entry.isDirectory())
      .forEach((entry) => directories.push(path.join(profilesDirectory, entry.name)));
  } catch (_error) {
    // A base without a Profiles directory is normal on other platforms/install types.
  }

  return directories;
}

export function extractZoteroInspireReadTokens(content: string): string[] {
  const tokens: string[] = [];
  TOKEN_PREF_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_PREF_PATTERN.exec(content)) !== null) {
    if (READ_TOKEN_PATTERN.test(match[1]) && !tokens.includes(match[1])) {
      tokens.push(match[1]);
    }
  }
  return tokens;
}

export async function discoverZoteroInspireReadTokens(): Promise<string[]> {
  const profileDirectories: string[] = [];
  for (const baseDirectory of getZoteroBases()) {
    profileDirectories.push(...await discoverProfileDirectories(baseDirectory));
  }

  const tokens: string[] = [];
  for (const profileDirectory of Array.from(new Set(profileDirectories))) {
    const prefs = await readTextFile(path.join(profileDirectory, "prefs.js"), MAX_PREFS_BYTES);
    if (!prefs) {
      continue;
    }
    for (const token of extractZoteroInspireReadTokens(prefs)) {
      if (!tokens.includes(token)) {
        tokens.push(token);
      }
    }
  }
  return tokens;
}
