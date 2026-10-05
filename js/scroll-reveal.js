(() => {
    const root = document.documentElement;
    const elements = [...document.querySelectorAll('[data-reveal]')];

    // Keep an empty page idle and content visible without observer support.
    if (!elements.length || !('IntersectionObserver' in window)) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let observer;

    function syncMotion() {
        observer?.disconnect();
        root.classList.remove('motion-ready');
        elements.forEach(element => element.classList.remove('is-visible', 'is-above'));
        if (reducedMotion.matches) return;

        observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                // Different entry/exit thresholds avoid flicker at the viewport edge.
                if (entry.isIntersecting && entry.intersectionRatio >= 0.08) {
                    entry.target.classList.add('is-visible');
                } else if (!entry.isIntersecting || entry.intersectionRatio <= 0.01) {
                    entry.target.classList.remove('is-visible');
                    entry.target.classList.toggle(
                        'is-above',
                        entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0)
                    );
                }
            });
        }, { threshold: [0, 0.01, 0.08], rootMargin: '-48px 0px -48px 0px' });

        elements.forEach(element => observer.observe(element));
        root.classList.add('motion-ready');
    }

    reducedMotion.addEventListener('change', syncMotion);
    syncMotion();
})();
