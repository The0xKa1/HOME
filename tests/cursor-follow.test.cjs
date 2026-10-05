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
    const dot = nodes.find(node => node.className === 'cursor-dot');
    function emit(type, x = 200, y = 200, element = target(), extra = {}) {
        const event = { clientX: x, clientY: y, target: element, pointerType: 'mouse', button: 0, buttons: 0, ...extra };
        document.emit(type, event);
        return event;
    }
    return {
        document, window, root, layer, dot, preferences, nodes, emit,
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
    assert.equal(p.layer.children.length, 1);
    assert.equal(p.layer.children[0], p.dot);
    assert.equal(p.nodes.filter(node => node.className === 'cursor-layer').length, 1);
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
