(() => {
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const players = new Map();

    document.querySelectorAll('[data-gif-player]').forEach(player => {
        const image = player.querySelector('img');
        const source = player.querySelector('source');
        const button = player.querySelector('button');
        const still = source.srcset;
        const label = player.querySelector('figcaption span').textContent;
        let paused = reducedMotion.matches;

        function update() {
            const next = paused || player.hidden ? still : image.dataset.gifSrc;
            if (image.getAttribute('src') !== next) image.src = next;
            // The picture source is the no-JS fallback; explicit playback wins here.
            source.media = 'not all';
            button.textContent = paused ? 'Play' : 'Pause';
            button.setAttribute('aria-label', `${paused ? 'Play' : 'Pause'} ${label}`);
        }

        players.set(player, update);
        button.hidden = false;
        button.addEventListener('click', () => {
            paused = !paused;
            update();
        });
        reducedMotion.addEventListener('change', () => {
            paused = reducedMotion.matches;
            update();
        });
        update();
    });

    document.querySelectorAll('[data-demo-gallery]').forEach(gallery => {
        const controls = gallery.querySelector('.demo-tabs');
        const buttons = [...controls.querySelectorAll('button')];
        const demos = [...gallery.querySelectorAll('[data-gif-player]')];

        function select(id) {
            demos.forEach(demo => {
                demo.hidden = demo.id !== id;
                players.get(demo)?.();
            });
            buttons.forEach(button => {
                button.setAttribute('aria-pressed', String(button.dataset.demoTarget === id));
            });
        }

        buttons.forEach(button => button.addEventListener('click', () => select(button.dataset.demoTarget)));
        select(buttons[0].dataset.demoTarget);
        controls.hidden = false;
    });
})();
