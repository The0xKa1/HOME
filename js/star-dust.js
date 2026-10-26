(() => {
    const sky = document.querySelector('.night-artwork');
    const button = sky?.querySelector('.night-interaction');
    if (!button) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const bursts = new Map();
    function remove(burst) {
        clearTimeout(bursts.get(burst));
        bursts.delete(burst);
        burst.remove();
    }
    function clear() { for (const burst of bursts.keys()) remove(burst); }
    button.hidden = false;
    button.addEventListener('click', event => {
        if (document.documentElement.getAttribute('data-theme') !== 'dark' || event.button !== 0) return;
        // Keep rapid clicks quiet and bound the number of temporary elements.
        if (bursts.size >= 3) return;
        const bounds = sky.getBoundingClientRect();
        const burst = document.createElement('span');
        burst.className = 'star-burst';
        burst.setAttribute('aria-hidden', 'true');
        burst.style.left = `${event.detail === 0 ? bounds.width / 2 : event.clientX - bounds.left}px`;
        burst.style.top = `${event.detail === 0 ? bounds.height / 2 : event.clientY - bounds.top}px`;
        if (!reducedMotion.matches) {
            const rotation = Math.random() * Math.PI * 2;
            for (let i = 0; i < 4; i++) {
                const speck = document.createElement('span');
                speck.className = 'star-speck';
                const angle = rotation + i * Math.PI / 2 + (Math.random() - 0.5) * 0.5;
                const distance = 15 + Math.random() * 15;
                speck.style.setProperty('--dust-x', `${Math.cos(angle) * distance}px`);
                speck.style.setProperty('--dust-y', `${Math.sin(angle) * distance}px`);
                burst.append(speck);
            }
        }
        sky.append(burst);
        bursts.set(burst, setTimeout(() => remove(burst), 850));
    });
    document.addEventListener('themechange', clear);
    document.addEventListener('visibilitychange', clear);
    reducedMotion.addEventListener('change', clear);
})();
