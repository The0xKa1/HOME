const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../js/cursor-follow.js'), 'utf8');

function events(extra = {}) {
    const listeners = new Map();
    return Object.assign(extra, {
        addEventListener(type, listener) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(listener);
        },
        emit(type, event = {}) { for (const listener of listeners.get(type) || []) listener(event); }
    });
}

function target({ link = false, ocean = false, input = false, media = '', disabled = false } = {}) {
    return {
        tagName: media,
        getBoundingClientRect: () => ({ bottom: 500 }),
        closest(selector) {
            if (selector.startsWith('input,')) return input ? this : null;
            if (selector.startsWith('video[')) return media ? this : null;
            if (selector === '.profile-artwork') return ocean ? this : null;
            if (selector === '.project-media') return media ? this : null;
            if (selector.startsWith('a[href]')) return (link || ocean) && !disabled ? this : null;
            return null;
        }
    };
}

function page({ fine = true, reduced = false, forced = false } = {}) {
    let nextFrame = 0, time = 0;
    const queue = new Map(), nodes = [];
    const preferences = [fine, reduced, forced].map(matches => events({ matches }));
    function element(tagName) {
        const classes = new Set();
        const node = {
            tagName, className: '', children: [],
            classList: {
                add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value),
                toggle(value, enabled) { if (enabled) classes.add(value); else classes.delete(value); }
            },
            style: { setProperty(name, value) { this[name] = value; } },
            setAttribute(name, value) { this[name === 'class' ? 'className' : name] = value; },
            getAttribute(name) { return this[name] ?? null; },
            append(...children) { this.children.push(...children); }
        };
        nodes.push(node);
        return node;
    }
    const root = element('html');
    root.clientWidth = 1200;
    root.clientHeight = 800;
    let hit = target();
    const document = events({
        documentElement: root, body: element('body'), hidden: false,
        createElement: element,
        createElementNS: (namespace, tagName) => element(tagName),
        elementFromPoint: () => hit
    });
    const window = events({
        matchMedia: query => preferences[query.includes('any-hover') ? 0 : query.includes('reduced-motion') ? 1 : 2]
    });
    const context = vm.createContext({
        document, window,
        requestAnimationFrame(fn) { queue.set(++nextFrame, fn); return nextFrame; },
        cancelAnimationFrame(id) { queue.delete(id); }
    });
    vm.runInContext(source, context);
    const layer = nodes.find(node => node.className === 'cursor-layer');
    const trail = nodes.find(node => node.className === 'cursor-trail');
    const trailCore = nodes.find(node => node.className === 'cursor-trail-core');
    const dot = nodes.find(node => node.className === 'cursor-dot');
    function emit(type, x = 200, y = 200, element = target(), extra = {}) {
        const event = { clientX: x, clientY: y, target: element, pointerType: 'mouse', button: 0, buttons: 0, timeStamp: time, ...extra };
        document.emit(type, event);
        return event;
    }
    return {
        document, window, root, layer, trail, trailCore, dot, preferences, nodes, emit,
        get visible() { return layer.classList.contains('is-visible'); },
        get nativeCursor() { return !root.classList.contains('has-custom-cursor'); },
        get pending() { return queue.size; },
        set hit(value) { hit = value; },
        advance(frames = 1) {
            for (let i = 0; i < frames; i++) {
                time += 1000 / 60;
                const callbacks = [...queue.values()];
                queue.clear();
                for (const callback of callbacks) callback(time);
            }
        }
    };
}

test('one dot tracks the pointer exactly and morphs only on enabled clickable content', () => {
    const p = page();
    for (const [element, hover] of [[target(), false], [target({ link: true }), true], [target({ media: 'VIDEO' }), false], [target({ link: true, disabled: true }), false]]) {
        p.emit('pointermove', 650, 220, element);
        assert.equal(p.visible, true);
        assert.equal(p.nativeCursor, false);
        assert.equal(p.layer.classList.contains('is-hovering'), hover);
        assert.equal(p.dot.style.transform, 'translate3d(650px, 220px, 0)');
    }
    p.emit('pointermove', 900, 350);
    assert.equal(p.dot.style.transform, 'translate3d(900px, 350px, 0)');
    assert.equal(p.pending, 0);
    assert.equal(p.layer.children.length, 2);
    assert.equal(p.layer.children[0], p.trail);
    assert.equal(p.layer.children[1], p.dot);
    assert.equal(p.nodes.filter(node => node.className === 'cursor-layer').length, 1);
    assert.equal(p.nodes.filter(node => node.className === 'cursor-dot').length, 1);
});

test('press feedback leaves click events intact and releases native cursor for dragging and selection', () => {
    const p = page();
    let clicks = 0;
    p.document.addEventListener('click', () => clicks++);
    p.emit('pointermove');
    p.emit('pointerdown', 200, 200, target(), { buttons: 1 });
    assert.equal(p.layer.classList.contains('is-pressed'), true);
    p.emit('pointerup');
    assert.equal(p.layer.classList.contains('is-pressed'), false);
    p.emit('click');
    assert.equal(clicks, 1);
    p.emit('pointerdown', 200, 200, target(), { buttons: 1 });
    p.emit('pointermove', 220, 200, target(), { buttons: 1 });
    assert.equal(p.visible, false);
    assert.equal(p.nativeCursor, true);
    p.emit('pointermove', 280, 200, target(), { buttons: 1 });
    assert.equal(p.visible, false);
    p.emit('pointerup', 280, 200);
    assert.equal(p.visible, true);
});

test('native controls, scrollbars, keyboard, menus, fullscreen and window exit always restore the system cursor', () => {
    const p = page();
    for (const native of [target({ input: true }), target({ media: 'AUDIO' }), target({ media: 'VIDEO' })]) {
        p.emit('pointermove');
        p.emit('pointermove', 300, 480, native);
        assert.equal(p.nativeCursor, true);
    }
    p.emit('pointermove', 1200, 200);
    assert.equal(p.visible, false);
    for (const type of ['keydown', 'contextmenu', 'pointercancel']) {
        p.emit('pointermove');
        p.document.emit(type);
        assert.equal(p.nativeCursor, true);
        assert.equal(p.pending, 0);
    }
    p.emit('pointermove');
    p.document.emit('pointerout', { relatedTarget: null });
    assert.equal(p.nativeCursor, true);
    p.emit('pointermove');
    p.window.emit('blur');
    assert.equal(p.nativeCursor, true);
    p.document.fullscreenElement = target({ media: 'VIDEO' });
    p.document.emit('fullscreenchange');
    p.emit('pointermove');
    assert.equal(p.visible, false);
});

test('touch, reduced motion, high contrast and hidden tabs do not run a custom cursor', () => {
    for (const option of [{ fine: false }, { reduced: true }, { forced: true }]) {
        const p = page(option);
        p.emit('pointermove');
        assert.equal(p.nativeCursor, true);
        assert.equal(p.pending, 0);
    }
    const p = page();
    p.emit('pointermove');
    p.emit('pointermove', 200, 200, target(), { pointerType: 'touch' });
    assert.equal(p.nativeCursor, true);
    p.emit('pointermove');
    p.preferences[1].matches = true;
    p.preferences[1].emit('change');
    assert.equal(p.nativeCursor, true);
    p.preferences[1].matches = false;
    p.emit('pointermove');
    p.document.hidden = true;
    p.document.emit('visibilitychange');
    assert.equal(p.pending, 0);
    assert.equal(p.nativeCursor, true);
});

test('scrolling under a stationary pointer rechecks the actual target', () => {
    const p = page();
    p.emit('pointermove');
    p.advance(240);
    p.hit = target({ input: true });
    p.document.emit('scroll');
    p.advance();
    assert.equal(p.nativeCursor, true);
});

test('ocean hides both cursors while preserving clicks, and leaving restores the single dot', () => {
    const p = page();
    p.emit('pointermove', 200, 200, target({ link: true }));
    assert.equal(p.layer.classList.contains('is-hovering'), true);
    p.emit('pointermove', 200, 200, target({ ocean: true }));
    assert.equal(p.visible, false);
    assert.equal(p.nativeCursor, false);
    assert.equal(p.layer.classList.contains('is-hovering'), false);
    let clicks = 0;
    p.document.addEventListener('click', () => clicks++);
    p.emit('pointerdown', 200, 200, target({ ocean: true }), { buttons: 1 });
    p.emit('pointerup', 200, 200, target({ ocean: true }));
    p.emit('click', 200, 200, target({ ocean: true }));
    assert.equal(clicks, 1);
    assert.equal(p.visible, false);
    p.emit('pointermove', 300, 220);
    assert.equal(p.visible, true);
    assert.equal(p.layer.classList.contains('is-hovering'), false);
    assert.equal(p.dot.style.transform, 'translate3d(300px, 220px, 0)');
    p.emit('pointermove', 300, 220, target({ media: 'VIDEO' }));
    assert.equal(p.layer.classList.contains('on-media'), true);
});

test('scrolling the ocean under and away from a stationary pointer updates visibility in both directions', () => {
    const p = page();
    p.emit('pointermove');
    p.hit = target({ ocean: true });
    p.document.emit('scroll');
    p.advance();
    assert.equal(p.visible, false);
    assert.equal(p.nativeCursor, false);
    p.hit = target({ link: true });
    p.document.emit('scroll');
    p.advance();
    assert.equal(p.visible, true);
    assert.equal(p.layer.classList.contains('is-hovering'), true);
    assert.equal(p.pending, 0);
});

test('dark artwork draws a meteor trail and restores the dot on exit', () => {
    const p = page();
    p.root.setAttribute('data-theme', 'dark');
    p.emit('pointermove', 650, 220, target({ ocean: true }));
    assert.equal(p.visible, true);
    assert.equal(p.layer.classList.contains('is-meteor'), true);
    assert.equal(p.layer.classList.contains('is-hovering'), false);
    assert.equal(p.trail.getAttribute('opacity'), '0.000');
    assert.equal(p.trailCore.getAttribute('d'), '');
    assert.equal(p.pending, 0);
    p.emit('pointermove', 660, 230, target({ ocean: true }));
    p.advance();
    assert.equal(p.trailCore.getAttribute('d'), 'M 650 220 L 660 230');
    assert(Number(p.trail.getAttribute('opacity')) > 0);
    assert.equal(p.dot.style.transform, 'translate3d(660px, 230px, 0)');
    const beforeExit = Number(p.trail.getAttribute('opacity'));
    p.emit('pointermove', 600, 230, target());
    assert.equal(p.layer.classList.contains('is-meteor'), false);
    assert.equal(p.visible, true);
    assert.equal(Number(p.trail.getAttribute('opacity')), beforeExit);
    p.advance(6);
    assert(Number(p.trail.getAttribute('opacity')) > 0);
    assert(Number(p.trail.getAttribute('opacity')) < beforeExit);
    assert.notEqual(p.trailCore.getAttribute('d'), '');
    p.advance(60);
    assert.equal(p.trail.getAttribute('opacity'), '0.000');
    assert.equal(p.trailCore.getAttribute('d'), '');
    assert.equal(p.pending, 0);
    p.emit('pointermove', 660, 230, target({ ocean: true }));
    p.document.emit('themechange');
    assert.equal(p.layer.classList.contains('is-meteor'), false);
    assert.equal(p.nativeCursor, true);
});

test('meteor trail curves through the actual pointer history', () => {
    const p = page();
    p.root.setAttribute('data-theme', 'dark');
    p.emit('pointermove', 100, 100, target({ ocean: true }));
    p.emit('pointermove', 140, 100, target({ ocean: true }));
    p.advance();
    p.emit('pointermove', 140, 140, target({ ocean: true }));
    p.advance();
    p.emit('pointermove', 180, 140, target({ ocean: true }));
    p.advance();
    const path = p.trailCore.getAttribute('d');
    assert(path.includes(' C '), 'multiple trajectory points produce a smooth curve');
    assert(path.includes('140 100'), 'the path retains the horizontal segment');
    assert(path.includes('140 140'), 'the path passes through the turning point');
    assert(path.endsWith('180 140'), 'the path ends at the current pointer');
});

test('meteor trail retracts along its path, fades and stops scheduling frames', () => {
    const p = page();
    p.root.setAttribute('data-theme', 'dark');
    p.emit('pointermove', 100, 100, target({ ocean: true }));
    for (let step = 1; step <= 6; step++) {
        p.emit('pointermove', 100 + step * 10, 100, target({ ocean: true }));
        p.advance();
    }
    const fullPath = p.trailCore.getAttribute('d');
    p.advance(32);
    const retractedPath = p.trailCore.getAttribute('d');
    assert.notEqual(retractedPath, fullPath);
    assert.notEqual(retractedPath, '');
    assert(Number(p.trail.getAttribute('opacity')) > 0);
    const beforeExpiry = Number(p.trail.getAttribute('opacity'));
    p.advance(8);
    assert.notEqual(p.trailCore.getAttribute('d'), '', 'expired history remains drawn while fading');
    assert(Number(p.trail.getAttribute('opacity')) > 0);
    assert(Number(p.trail.getAttribute('opacity')) < beforeExpiry);
    p.advance(60);
    assert.equal(p.trailCore.getAttribute('d'), '');
    assert.equal(p.trail.getAttribute('opacity'), '0.000');
    assert.equal(p.pending, 0);
});

test('continuous motion keeps the trajectory bright and bounded', () => {
    const p = page();
    p.root.setAttribute('data-theme', 'dark');
    p.emit('pointermove', 100, 100, target({ ocean: true }));
    for (let step = 1; step <= 24; step++) {
        p.emit('pointermove', 100 + step * 16, 100, target({ ocean: true }), { timeStamp: step * 1000 / 60 });
        p.advance();
    }
    const path = p.trailCore.getAttribute('d');
    const segments = (path.match(/ C /g) || []).length;
    assert(segments > 4);
    assert(segments < 24, 'the trail keeps only the most recent trajectory');
    assert(Number(p.trail.getAttribute('opacity')) > 0.95);
    assert(path.endsWith('484 100'));
    p.advance(120);
    assert.equal(p.trailCore.getAttribute('d'), '');
    assert.equal(p.trail.getAttribute('opacity'), '0.000');
    assert.equal(p.pending, 0);
});
