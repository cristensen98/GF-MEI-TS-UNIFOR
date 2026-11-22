export type Theme = 'light' | 'dark';
const storageKey = 'gfmei:theme';

export function initializeTheme() {
    try {
        document.documentElement.dataset.theme = localStorage.getItem(storageKey) === 'dark' ? 'dark' : 'light';
    } catch {
        document.documentElement.dataset.theme = 'light';
    }
}

export function setTheme(theme: Theme) {
    document.documentElement.dataset.theme = theme;
    try {
        localStorage.setItem(storageKey, theme);
    } catch {
        // The selected theme still applies when browser storage is unavailable.
    }
}
