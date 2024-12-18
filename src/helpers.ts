export function arrayHasDuplicatesByKeys(arr: any[], keys: string[]) {
  const seen = new Set();
  for (const obj of arr) {
    const key = Object.keys(obj)
      .filter((k) => keys.includes(k))
      .map((k) => obj[k])
      .join(':');
    if (!seen.has(key)) {
      seen.add(key);
    } else {
      return true; // found a duplicate
    }
  }
  return false; // no duplicates found
}
