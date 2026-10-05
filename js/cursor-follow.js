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
    const ring = document.createElement('div');
    ring.className = 'cursor-ring';
    layer.append(ring, dot);
    document.body.append(layer);

    let frame = 0, lastTime = 0;
    let active = false, pressed = false, dragging = false;
    let overLink = false, needsHitTest = false;
    let x = 0, y = 0, lagX = 0, lagY = 0;
    let downX = 0, downY = 0;
    let size = 1, sizeVelocity = 0;

    function allowed() {
        return finePointer.matches && !reducedMotion.matches && !forcedColors.matches
            && !document.hidden && !document.fullscreenElement;
    }

    function hide() {
        active = pressed = false;
        layer.classList.remove('is-visible');
        root.classList.remove('has-custom-cursor');
        cancelAnimationFrame(frame);
        frame = 0;
        lastTime = 0;
        size = 1;
        sizeVelocity = 0;
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
        overLink = !!target.closest('a, button, [role="button"]') && !target.closest('.ocean-interaction');
        layer.classList.toggle('on-media', !!target.closest('.profile-artwork, .project-media'));
        return true;
    }

    function schedule() {
        if (!frame && active) frame = requestAnimationFrame(draw);
    }

    function draw(now) {
        frame = 0;
        if (!active) return;
        if (!allowed()) { hide(); return; }
        if (needsHitTest) {
            needsHitTest = false;
            if (!updateTarget(document.elementFromPoint(x, y))) return;
        }
        const dt = lastTime ? Math.min((now - lastTime) / 1000, 0.032) : 1 / 60;
        lastTime = now;
        const follow = 1 - Math.exp(-dt * 12);
        const dx = x - lagX, dy = y - lagY;
        lagX += dx * follow;
        lagY += dy * follow;
        const distance = Math.hypot(dx, dy);
        const targetSize = pressed ? 0.78 : overLink ? 1.4 : 1;
        sizeVelocity += ((targetSize - size) * 260 - sizeVelocity * 22) * dt;
        size += sizeVelocity * dt;
        ring.style.transform = `translate3d(${lagX}px, ${lagY}px, 0) scale(${size})`;
        if (distance > 0.05 || Math.abs(targetSize - size) > 0.001 || Math.abs(sizeVelocity) > 0.005) schedule();
        else {
            lagX = x;
            lagY = y;
            ring.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${targetSize})`;
            lastTime = 0;
        }
    }

    function move(event) {
        if (event.pointerType !== 'mouse' || !allowed()) { hide(); return; }
        x = event.clientX;
        y = event.clientY;
        if (event.buttons === 0) dragging = false;
        if (pressed && Math.hypot(x - downX, y - downY) > 5) dragging = true;
        if (dragging || !updateTarget(event.target)) { hide(); return; }
        // Only the outer ring lags; the small hotspot always stays precise.
        dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        if (!active) {
            lagX = x;
            lagY = y;
            active = true;
            ring.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1)`;
            layer.classList.add('is-visible');
            root.classList.add('has-custom-cursor');
        }
        schedule();
    }

    document.addEventListener('pointermove', move, { passive: true });
    document.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'mouse' || event.button !== 0) { hide(); return; }
        move(event);
        if (!active) return;
        pressed = true;
        downX = x;
        downY = y;
        schedule();
    }, { passive: true });
    document.addEventListener('pointerup', event => {
        if (event.pointerType !== 'mouse' || event.button !== 0) return;
        pressed = dragging = false;
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
    document.addEventListener('scroll', () => { needsHitTest = true; schedule(); }, { passive: true, capture: true });
    window.addEventListener('blur', hide);
    window.addEventListener('resize', hide);
    for (const preference of [finePointer, reducedMotion, forcedColors]) preference.addEventListener('change', hide);
})();
