const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../js/ocean-motion.js'), 'utf8');

function eventTarget(extra = {}) {
    const listeners = new Map();
    return Object.assign(extra, {
        addEventListener(type, fn) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(fn);
        },
        emit(type, event = {}) { for (const fn of listeners.get(type) || []) fn(event); },
        setAttribute(name, value) { this[name] = value; }
    });
}

function createOcean({ reduced = false, gpu = true, shaderOK = true, width = 540, height = 660 } = {}) {
    const classes = new Set();
    const motion = eventTarget({ matches: reduced });
    const image = eventTarget({ complete: true, naturalWidth: 1672, naturalHeight: 941 });
    const interaction = eventTarget({ hidden: true });
    const button = eventTarget({ hidden: true });
    const uniforms = {}, shaders = [];
    const frames = [];
    let observer, time = 0, nextFrame = 0;
    const queue = new Map();
    const gl = new Proxy({
        VERTEX_SHADER: 0x8B31, FRAGMENT_SHADER: 0x8B30,
        createShader: type => ({ type }),
        shaderSource(shader, text) { shaders.push({ type: shader.type, text }); },
        getShaderParameter: () => shaderOK,
        getProgramParameter: () => true,
        getAttribLocation: () => 0,
        getUniformLocation: (_, name) => name,
        uniform1f(name, x) { uniforms[name] = x; },
        uniform2f(name, x, y) { uniforms[name] = [x, y]; },
        uniform3f(name, x, y, z) { uniforms[name] = [x, y, z]; },
        uniform4fv(name, values) { uniforms[name] = [...values]; },
        drawArrays() { frames.push(JSON.parse(JSON.stringify(uniforms))); }
    }, { get: (object, key) => object[key] ?? (/^[A-Z_0-9]+$/.test(key) ? 1 : () => ({})) });
    const canvas = eventTarget({ width: 300, height: 150, getContext: () => gpu ? gl : null });
    const bounds = { left: 800, top: 90, width, height };
    const artwork = {
        clientWidth: width, clientHeight: height,
        getBoundingClientRect: () => bounds,
        querySelector: selector => ({ '.ocean': image, '.ocean-canvas': canvas, '.ocean-interaction': interaction, '.ocean-motion-toggle': button })[selector],
        classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name), remove: name => classes.delete(name) }
    };
    const document = eventTarget({ hidden: false, querySelector: () => artwork });
    vm.runInNewContext(source, {
        document,
        window: { devicePixelRatio: 2, matchMedia: () => motion, IntersectionObserver: true, ResizeObserver: true },
        requestAnimationFrame(fn) { const id = ++nextFrame; queue.set(id, fn); return id; },
        cancelAnimationFrame(id) { queue.delete(id); },
        IntersectionObserver: class { constructor(fn) { observer = fn; } observe() {} },
        ResizeObserver: class { observe() {} }
    });
    return {
        motion, image, interaction, button, canvas, document, queue, classes, frames, shaders, width, height,
        latest: () => frames.at(-1),
        eventAt: (x, y, extra = {}) => ({ clientX: bounds.left + width * x, clientY: bounds.top + height * (1 - y), pointerType: 'mouse', button: 0, detail: 1, ...extra }),
        visibility: visible => observer([{ isIntersecting: visible }]),
        advance(count = 1, milliseconds = 40) {
            for (let i = 0; i < count; i++) {
                assert.equal(queue.size, 1, 'exactly one animation loop should run');
                const [id, fn] = queue.entries().next().value;
                queue.delete(id);
                time += milliseconds;
                fn(time);
            }
        }
    };
}
const activeRipples = frame => frame['ripples[0]'].filter((_, i) => i % 4 === 3).reduce((a, b) => a + b, 0);

test('hover follows the pointer smoothly, uses bottom-up coordinates, then relaxes on leave', () => {
    const o = createOcean();
    o.interaction.emit('pointerenter', o.eventAt(0.8, 0.25));
    o.advance(3);
    const initial = o.latest().pointer;
    assert(initial[0] > 0.5 && initial[0] < 0.8);
    assert(initial[1] < 0.5 && initial[1] > 0.25);
    assert(initial[2] > 0 && initial[2] < 1);
    o.advance(40);
    assert(Math.abs(o.latest().pointer[0] - 0.8) < 0.001);
    assert(Math.abs(o.latest().pointer[1] - 0.25) < 0.001);
    o.interaction.emit('pointerleave'); o.advance(40);
    assert(o.latest().pointer[2] < 0.001);
    assert(Math.abs(o.latest().pointer[0] - 0.5) < 0.001);
});

test('clicks create bounded, independent ripples at their actual positions and expire', () => {
    const o = createOcean();
    o.interaction.emit('click', o.eventAt(0.7, 0.2)); o.advance(2);
    const first = o.latest()['ripples[0]'];
    assert(Math.abs(first[0] - 0.7) < 0.0001); assert(Math.abs(first[1] - 0.2) < 0.0001);
    assert(first[2] > 0); assert.equal(first[3], 1);
    for (let i = 0; i < 8; i++) o.interaction.emit('click', o.eventAt(0.1 + i * 0.1, 0.5));
    o.advance(); assert.equal(activeRipples(o.latest()), 4);
    o.advance(110); assert.equal(activeRipples(o.latest()), 0);
});

test('touch taps and keyboard activation create ripples without touch hover or scroll handlers', () => {
    const o = createOcean();
    o.interaction.emit('pointermove', o.eventAt(0.2, 0.3, { pointerType: 'touch' })); o.advance(5);
    assert.equal(o.latest().pointer[2], 0);
    o.interaction.emit('click', o.eventAt(0.2, 0.3, { pointerType: 'touch' })); o.advance();
    assert(Math.abs(o.latest()['ripples[0]'][0] - 0.2) < 0.0001);
    o.interaction.emit('click', { detail: 0, button: 0 }); o.advance();
    assert.deepEqual(o.latest()['ripples[0]'].slice(4, 6), [0.5, 0.5]);
    o.interaction.emit('click', o.eventAt(0.1, 0.9, { button: 2 })); o.advance();
    assert.equal(activeRipples(o.latest()), 2);
});

test('pause controls do not emit ripples and all interactions stop while paused', () => {
    const o = createOcean();
    o.button.emit('click'); assert.equal(o.queue.size, 0); assert.equal(o.interaction.hidden, true);
    o.interaction.emit('click', o.eventAt(0.4, 0.4));
    o.interaction.emit('pointerenter', o.eventAt(0.4, 0.4));
    o.button.emit('click'); o.advance(3);
    assert.equal(activeRipples(o.latest()), 0); assert.equal(o.latest().pointer[2], 0);
});

test('reduced motion, GPU failure, context loss and hidden pages preserve fallback behavior', () => {
    for (const options of [{ reduced: true }, { gpu: false }, { shaderOK: false }]) {
        const o = createOcean(options);
        assert.equal(o.queue.size, 0); assert.equal(o.interaction.hidden, true); assert(!o.classes.has('ocean-running'));
    }
    const o = createOcean();
    o.interaction.emit('click', o.eventAt(0.7, 0.2)); o.advance();
    o.motion.matches = true; o.motion.emit('change'); assert.equal(o.queue.size, 0); assert.equal(o.interaction.hidden, true);
    o.motion.matches = false; o.motion.emit('change'); assert.equal(activeRipples(o.latest()), 0);
    o.visibility(false); assert.equal(o.queue.size, 0);
    o.visibility(true); assert.equal(o.queue.size, 1);
    o.document.hidden = true; o.document.emit('visibilitychange'); assert.equal(o.queue.size, 0);
    o.document.hidden = false; o.document.emit('visibilitychange'); assert.equal(o.queue.size, 1);
    o.canvas.emit('webglcontextlost', { preventDefault() {} }); assert.equal(o.queue.size, 0); assert.equal(o.interaction.hidden, true);
    o.canvas.emit('webglcontextrestored'); assert.equal(o.queue.size, 1); assert.equal(o.interaction.hidden, false);
});

test('viewport aspect and drawing resolution remain correct for wide and tall layouts', () => {
    for (const [width, height] of [[540, 660], [900, 400], [2000, 1400]]) {
        const o = createOcean({ width, height });
        assert.equal(o.latest().aspect, width / height);
        assert(Math.max(o.canvas.width, o.canvas.height) <= 1800);
        o.advance(); const before = o.frames.length; o.advance(1, 10); assert.equal(o.frames.length, before);
    }
});

// Optional GPU integration fixtures: these are the actual uniforms produced by event handlers.
if (process.env.OCEAN_RENDER_FIXTURES) {
    const dir = process.env.OCEAN_RENDER_FIXTURES;
    fs.mkdirSync(dir, { recursive: true });
    const o = createOcean();
    o.interaction.emit('pointerenter', o.eventAt(0.57, 0.6)); o.advance(30);
    const hover = o.latest();
    o.interaction.emit('pointerleave'); o.advance(50);
    o.interaction.emit('click', o.eventAt(0.57, 0.6)); o.advance(12);
    const ripple = o.latest();
    o.advance(24); const expanded = o.latest();
    const states = { hover, ripple, expanded };
    for (const [name, state] of Object.entries(states)) {
        const save = (filename, data) => fs.writeFileSync(path.join(dir, `${filename}.txt`), [o.width, o.height, data.time, ...data.cover, data.aspect, ...data.pointer, ...data['ripples[0]']].join(' ') + '\n');
        save(name, state);
        save(`${name}-baseline`, { ...state, pointer: [0.5, 0.5, 0], 'ripples[0]': Array(16).fill(0) });
    }
    for (const shader of o.shaders) {
        fs.writeFileSync(path.join(dir, shader.type === 0x8B31 ? 'ocean.vert' : 'ocean.frag'), shader.text);
    }
}
