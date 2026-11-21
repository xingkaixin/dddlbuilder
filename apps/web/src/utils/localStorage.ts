export function writeLocalStorageJson<T>(key: string, value: T, label: string): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`${label} failed`, error);
  }
}

export function removeLocalStorageItem(key: string, label: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`${label} failed`, error);
  }
}
