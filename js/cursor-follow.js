(() => {
    const root = document.documentElement;
    const finePointer = window.matchMedia('(any-hover: hover) and (any-pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const forcedColors = window.matchMedia('(forced-colors: active)');
    const layer = document.createElement('div');
    layer.className = 'cursor-layer';
    layer.setAttribute('aria-hidden', 'true');
    const svgNS = 'http://www.w3.org/2000/svg';
    function svgElement(tagName, className) {
        const element = document.createElementNS(svgNS, tagName);
        if (className) element.setAttribute('class', className);
        return element;
    }
    const trail = svgElement('svg', 'cursor-trail');
    const trailDefs = svgElement('defs');
    const gradient = svgElement('linearGradient');
    gradient.setAttribute('id', 'cursor-meteor-gradient');
    gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
    for (const [offset, color, opacity] of [
        ['0%', '#82A9FF', '0'],
        ['18%', '#A6B5CF', '0.025'],
        ['65%', '#C2CCDC', '0.20'],
        ['100%', '#E4E8F0', '0.55']
    ]) {
        const stop = svgElement('stop');
        stop.setAttribute('offset', offset);
        stop.setAttribute('stop-color', color);
        stop.setAttribute('stop-opacity', opacity);
        gradient.append(stop);
    }
    trailDefs.append(gradient);
    const trailGlow = svgElement('path', 'cursor-trail-glow');
    const trailCore = svgElement('path', 'cursor-trail-core');
    trail.setAttribute('opacity', '0');
    trail.append(trailDefs, trailGlow, trailCore);
    const dot = document.createElement('div');
    dot.className = 'cursor-dot';
    layer.append(trail, dot);
    document.body.append(layer);

    let frame = 0, meteorFrame = 0;
    let active = false, pressed = false, dragging = false;
    let x = 0, y = 0, downX = 0, downY = 0;
    let meteorActive = false, meteorOpacity = 0;
    let meteorPoints = [], lastFrameAt = null;
    const trailLifetime = 600, trailLimit = 110;

    function allowed() {
        return finePointer.matches && !reducedMotion.matches && !forcedColors.matches
            && !document.hidden && !document.fullscreenElement;
    }

    function resetMeteor() {
        cancelAnimationFrame(meteorFrame);
        meteorFrame = 0;
        meteorOpacity = 0;
        meteorPoints = [];
        lastFrameAt = null;
        trail.setAttribute('opacity', '0.000');
        trailGlow.setAttribute('d', '');
        trailCore.setAttribute('d', '');
    }

    function interpolatePoint(from, to, ratio) {
        return {
            x: from.x + (to.x - from.x) * ratio,
            y: from.y + (to.y - from.y) * ratio,
            time: from.time + (to.time - from.time) * ratio
        };
    }

    function trimMeteorTrail(now) {
        const cutoff = now - trailLifetime;
        const first = meteorPoints.findIndex(point => point.time >= cutoff);
        if (first === -1) {
            meteorPoints = [];
            return [];
        }
        let visible;
        if (first > 0) {
            const before = meteorPoints[first - 1], after = meteorPoints[first];
            const span = after.time - before.time;
            const ratio = span > 0 ? Math.max(0, Math.min(1, (cutoff - before.time) / span)) : 1;
            visible = [interpolatePoint(before, after, ratio), ...meteorPoints.slice(first)];
            if (first > 1) meteorPoints = meteorPoints.slice(first - 1);
        } else {
            visible = meteorPoints.slice();
        }
        let length = 0;
        for (let i = visible.length - 1; i > 0; i--) {
            const from = visible[i], to = visible[i - 1];
            const segment = Math.hypot(to.x - from.x, to.y - from.y);
            if (length + segment > trailLimit) {
                const ratio = (trailLimit - length) / segment;
                return [interpolatePoint(from, to, ratio), ...visible.slice(i)];
            }
            length += segment;
        }
        return visible;
    }

    function meteorPath(points) {
        const coordinate = value => Number(value.toFixed(1));
        const start = points[0];
        if (points.length === 2) {
            const end = points[1];
            return `M ${coordinate(start.x)} ${coordinate(start.y)} L ${coordinate(end.x)} ${coordinate(end.y)}`;
        }
        let path = `M ${coordinate(start.x)} ${coordinate(start.y)}`;
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[Math.max(0, i - 1)], p1 = points[i];
            const p2 = points[i + 1], p3 = points[Math.min(points.length - 1, i + 2)];
            const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
            const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
            path += ` C ${coordinate(c1x)} ${coordinate(c1y)} ${coordinate(c2x)} ${coordinate(c2y)} ${coordinate(p2.x)} ${coordinate(p2.y)}`;
        }
        return path;
    }

    function renderMeteor(points) {
        const path = meteorPath(points);
        trailGlow.setAttribute('d', path);
        trailCore.setAttribute('d', path);
        const first = points[0], last = points[points.length - 1];
        let dx = last.x - first.x, dy = last.y - first.y;
        if (Math.hypot(dx, dy) < 1) {
            const previous = points[points.length - 2];
            dx = last.x - previous.x;
            dy = last.y - previous.y;
        }
        if (Math.hypot(dx, dy) < 0.001) dx = 1;
        gradient.setAttribute('x1', last.x - dx);
        gradient.setAttribute('y1', last.y - dy);
        gradient.setAttribute('x2', last.x);
        gradient.setAttribute('y2', last.y);
    }

    function animateMeteor(now) {
        meteorFrame = 0;
        if (!allowed()) { hide(); return; }
        const dt = lastFrameAt === null ? 1000 / 60 : Math.min(50, Math.max(1, now - lastFrameAt));
        lastFrameAt = now;
        const idle = now - (meteorPoints.at(-1)?.time ?? -Infinity);
        const points = trimMeteorTrail(now);
        const visible = points.length > 1;
        // Fade before the history expires; retain the last path until fully dim.
        const progress = Math.max(0, Math.min(1, (idle - 80) / (trailLifetime - 80)));
        const targetOpacity = meteorActive && visible ? 1 - progress * progress * (3 - 2 * progress) : 0;
        const smoothing = targetOpacity > meteorOpacity ? 28 : 140;
        meteorOpacity += (targetOpacity - meteorOpacity) * (1 - Math.exp(-dt / smoothing));
        if (visible && meteorActive) {
            renderMeteor(points);
        }
        trail.setAttribute('opacity', meteorOpacity.toFixed(3));
        if ((visible && meteorActive) || meteorOpacity > 0.002) meteorFrame = requestAnimationFrame(animateMeteor);
        else resetMeteor();
    }

    function updateMeteor(dx, dy, timeStamp, entering) {
        const now = Number.isFinite(timeStamp) ? timeStamp : (lastFrameAt ?? 0);
        if (entering) {
            meteorPoints = [{ x, y, time: now }];
            return;
        }
        if (!meteorPoints.length) {
            meteorPoints.push({ x: x - dx, y: y - dy, time: now - 1000 / 60 });
        }
        let last = meteorPoints[meteorPoints.length - 1];
        if (now - last.time > 80) {
            meteorPoints = [{ x: last.x, y: last.y, time: now - 1000 / 60 }];
            last = meteorPoints[0];
        }
        if (Math.hypot(x - last.x, y - last.y) < 0.25) return;
        meteorPoints.push({ x, y, time: now });
        if (meteorPoints.length > 96) meteorPoints.splice(0, meteorPoints.length - 96);
        if (!meteorFrame) meteorFrame = requestAnimationFrame(animateMeteor);
    }

    function hide() {
        active = pressed = false;
        meteorActive = false;
        resetMeteor();
        layer.classList.remove('is-visible');
        layer.classList.remove('is-hovering');
        layer.classList.remove('is-pressed');
        layer.classList.remove('is-meteor');
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
        const ocean = root.getAttribute('data-theme') !== 'dark' && !!target.closest('.profile-artwork');
        const meteor = root.getAttribute('data-theme') === 'dark' && !!target.closest('.profile-artwork');
        const clickable = !!target.closest('a[href]:not([aria-disabled="true"]), button:not(:disabled):not([aria-disabled="true"]), [role="button"]:not([aria-disabled="true"])');
        if (meteor !== meteorActive) {
            meteorActive = meteor;
            if (meteor) resetMeteor();
            else if (!meteorFrame && meteorOpacity > 0) meteorFrame = requestAnimationFrame(animateMeteor);
        }
        layer.classList.toggle('is-visible', !ocean);
        layer.classList.toggle('is-hovering', !ocean && !meteor && clickable);
        layer.classList.toggle('is-meteor', meteor);
        layer.classList.toggle('on-media', !!target.closest('.project-media'));
        // Keep the native cursor suppressed over the ocean while its own water
        // interaction continues to receive pointer events underneath this layer.
        return true;
    }

    function move(event) {
        if (event.pointerType !== 'mouse' || !allowed()) { hide(); return; }
        const wasActive = active, wasMeteor = meteorActive;
        const dx = event.clientX - x;
        const dy = event.clientY - y;
        x = event.clientX;
        y = event.clientY;
        if (event.buttons === 0) dragging = false;
        if (pressed && Math.hypot(x - downX, y - downY) > 5) dragging = true;
        if (dragging || !updateTarget(event.target)) { hide(); return; }
        if (meteorActive) updateMeteor(dx, dy, event.timeStamp, !wasMeteor || !wasActive);
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
    document.addEventListener('themechange', hide);
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
