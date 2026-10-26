(() => {
    const root = document.documentElement;
    const system = window.matchMedia('(prefers-color-scheme: dark)');
    const storageKey = 'home-theme';
    let preference;
    try { preference = localStorage.getItem(storageKey); } catch {}
    if (preference !== 'light' && preference !== 'dark') preference = null;

    function apply() {
        const theme = preference || (system.matches ? 'dark' : 'light');
        root.setAttribute('data-theme', theme);
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#151615' : '#FFFFFF');
        const button = document.querySelector('.theme-toggle');
        if (button) {
            button.hidden = false;
            button.setAttribute('aria-pressed', String(theme === 'dark'));
            button.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
        }
        document.dispatchEvent(new Event('themechange'));
    }
    // Run before the styles load to avoid a light flash on a dark visit.
    apply();
    document.addEventListener('DOMContentLoaded', () => {
        apply();
        document.querySelector('.theme-toggle')?.addEventListener('click', () => {
            preference = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            try { localStorage.setItem(storageKey, preference); } catch {}
            apply();
        });
    });
    system.addEventListener('change', () => { if (!preference) apply(); });
    window.addEventListener('storage', event => {
        if (event.key !== storageKey && event.key !== null) return;
        preference = event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : null;
        apply();
    });
})();
