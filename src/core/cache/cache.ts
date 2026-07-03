const PREFIX = "code-memory:";

export function getCache(key: string): string | null {
  return localStorage.getItem(PREFIX + key);
}

export function setCache(key: string, value: string): void {
  localStorage.setItem(PREFIX + key, value);
}
