(() => {
    const root = document.documentElement;
    const finePointer = window.matchMedia('(any-hover: hover) and (any-pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const forcedColors = window.matchMedia('(forced-colors: active)');
    const layer = document.createElement('div');
    layer.className = 'cursor-layer';
    layer.setAttribute('aria-hidden', 'true');
    const dot = document.createElement('div');
    dot.className = 'cursor-dot';
    layer.append(dot);
    document.body.append(layer);

    let frame = 0;
    let active = false, pressed = false, dragging = false;
    let x = 0, y = 0, downX = 0, downY = 0;

    function allowed() {
        return finePointer.matches && !reducedMotion.matches && !forcedColors.matches
            && !document.hidden && !document.fullscreenElement;
    }

    function hide() {
        active = pressed = false;
        layer.classList.remove('is-visible');
        layer.classList.remove('is-hovering');
        layer.classList.remove('is-pressed');
        root.classList.remove('has-custom-cursor');
        cancelAnimationFrame(frame);
        frame = 0;
    }

    function nativeTarget(target) {
        if (!target?.closest) return true;
        if (target.closest('input, textarea, select, iframe, [contenteditable]:not([contenteditable="false"])')) return true;
        const video = target.closest('video[controls], audio[controls]');
        if (video) {
            const bounds = video.getBoundingClientRect();
            if (video.tagName === 'AUDIO' || y >= bounds.bottom - 52) return true;
        }
        return x >= root.clientWidth || y >= root.clientHeight || x < 0 || y < 0;
    }

    function updateTarget(target) {
        if (nativeTarget(target)) { hide(); return false; }
        const ocean = !!target.closest('.profile-artwork');
        const clickable = !!target.closest('a[href]:not([aria-disabled="true"]), button:not(:disabled):not([aria-disabled="true"]), [role="button"]:not([aria-disabled="true"])');
        layer.classList.toggle('is-visible', !ocean);
        layer.classList.toggle('is-hovering', !ocean && clickable);
        layer.classList.toggle('on-media', !!target.closest('.project-media'));
        // Keep the native cursor suppressed over the ocean while its own water
        // interaction continues to receive pointer events underneath this layer.
        return true;
    }

    function move(event) {
        if (event.pointerType !== 'mouse' || !allowed()) { hide(); return; }
        x = event.clientX;
        y = event.clientY;
        if (event.buttons === 0) dragging = false;
        if (pressed && Math.hypot(x - downX, y - downY) > 5) dragging = true;
        if (dragging || !updateTarget(event.target)) { hide(); return; }
        // One element stays at the actual pointer and morphs from dot to ring.
        dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        active = true;
        root.classList.add('has-custom-cursor');
    }

    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'mouse' || event.button !== 0) { hide(); return; }
        move(event);
        if (!active) return;
        pressed = true;
        layer.classList.add('is-pressed');
        downX = x;
        downY = y;
    }, { passive: true });
    document.addEventListener('pointerup', event => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        pressed = dragging = false;
        layer.classList.remove('is-pressed');
        move(event);
    }, { passive: true });
    document.addEventListener('pointerout', event => { if (!event.relatedTarget) hide(); });
    document.addEventListener('pointercancel', hide);
    document.addEventListener('dragstart', () => { dragging = true; hide(); });
    document.addEventListener('dragend', () => { dragging = false; });
    document.addEventListener('contextmenu', hide);
    document.addEventListener('keydown', hide);
    document.addEventListener('visibilitychange', hide);
    document.addEventListener('fullscreenchange', hide);
    document.addEventListener('scroll', () => {
        if (!active || frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            if (!allowed()) { hide(); return; }
            updateTarget(document.elementFromPoint(x, y));
        });
    }, { passive: true, capture: true });
    window.addEventListener('blur', hide);
    window.addEventListener('resize', hide);
    for (const preference of [finePointer, reducedMotion, forcedColors]) preference.addEventListener('change', hide);
})();
