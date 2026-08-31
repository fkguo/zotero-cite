export function uniqueCiteKeys(keys: Iterable<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of keys) {
    const key = String(value).trim();
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(key);
  }

  return result;
}

export function getMissingCiteKeys(existingKeys: Iterable<string>, requestedKeys: Iterable<string>): string[] {
  const existing = new Set(uniqueCiteKeys(existingKeys));
  return uniqueCiteKeys(requestedKeys).filter((key) => !existing.has(key));
}
