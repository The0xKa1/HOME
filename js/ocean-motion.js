(() => {
    const artwork = document.querySelector('.profile-artwork');
    if (!artwork) return;
    const image = artwork.querySelector('.ocean');
    const canvas = artwork.querySelector('.ocean-canvas');
    const interaction = artwork.querySelector('.ocean-interaction');
    const button = artwork.querySelector('.ocean-motion-toggle');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let renderer;
    let failed = false;
    let paused = false;
    let visible = true;
    let frame = 0;
    let lastTime = 0;
    let elapsed = 0;
    const pointer = { x: 0.5, y: 0.5, targetX: 0.5, targetY: 0.5, strength: 0, targetStrength: 0 };
    const ripples = [];
    const rippleData = new Float32Array(16);

    function resetPointer() {
        pointer.targetX = 0.5;
        pointer.targetY = 0.5;
        pointer.targetStrength = 0;
    }

    function canInteract() {
        return renderer && !failed && !paused && !reducedMotion.matches && visible && !document.hidden;
    }

    function positionAt(event) {
        const bounds = artwork.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return { x: 0.5, y: 0.5 };
        return {
            x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
            // Texture coordinates start at the bottom, unlike pointer events.
            y: 1 - Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
        };
    }

    function movePointer(event) {
        if (!canInteract() || event.pointerType === 'touch') return;
        const point = positionAt(event);
        pointer.targetX = point.x;
        pointer.targetY = point.y;
        pointer.targetStrength = 1;
    }

    function addRipple(event) {
        if (!canInteract() || event.button !== 0) return;
        const point = event.detail === 0 ? { x: 0.5, y: 0.5 } : positionAt(event);
        ripples.push({ ...point, started: elapsed });
        // A fixed-size pool bounds shader work even during rapid clicking.
        if (ripples.length > 4) ripples.shift();
    }

    function createRenderer() {
        const gl = canvas.getContext('webgl', {
            alpha: false, antialias: false, depth: false,
            stencil: false, powerPreference: 'low-power'
        });
        if (!gl) throw new Error('WebGL unavailable');

        function shader(type, source) {
            const result = gl.createShader(type);
            gl.shaderSource(result, source);
            gl.compileShader(result);
            if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
                gl.deleteShader(result);
                throw new Error('Ocean shader unavailable');
            }
            return result;
        }

        const vertex = shader(gl.VERTEX_SHADER, `
            attribute vec2 position;
            varying vec2 uv;
            void main() {
                uv = position * 0.5 + 0.5;
                gl_Position = vec4(position, 0.0, 1.0);
            }
        `);
        const fragment = shader(gl.FRAGMENT_SHADER, `
            precision mediump float;
            uniform sampler2D ocean;
            uniform vec2 cover;
            uniform float time;
            uniform float aspect;
            uniform vec3 pointer;
            uniform vec4 ripples[4];
            varying vec2 uv;
            void main() {
                // Slow, overlapping currents deform the existing water texture.
                // Sampling the original image preserves its Klein-blue palette.
                vec2 flow = vec2(
                    sin(uv.y * 23.0 + time * 0.22 + sin(uv.x * 11.0 - time * 0.12)),
                    sin(uv.x * 19.0 - time * 0.18 + sin(uv.y * 13.0 + time * 0.09))
                ) * vec2(0.0045, 0.003);
                vec2 drift = vec2(sin(time * 0.055), cos(time * 0.045)) * 0.007;
                // Measure distance in viewport-height units so ripples stay circular.
                vec2 metric = vec2(aspect, 1.0);
                vec2 offset = (uv - pointer.xy) * metric;
                float distance = length(offset);
                vec2 direction = offset / max(distance, 0.001);
                float wake = sin(distance * 34.0 - time * 0.95)
                    * exp(-distance * distance * 24.0) * pointer.z;
                vec2 disturbance = direction / metric * wake * 0.009;
                for (int i = 0; i < 4; i++) {
                    float age = ripples[i].z;
                    if (ripples[i].w > 0.0 && age >= 0.0 && age < 4.0) {
                        vec2 delta = (uv - ripples[i].xy) * metric;
                        float radius = length(delta);
                        float front = radius - age * 0.30;
                        float wave = sin(front * 95.0) * exp(-front * front / 0.008)
                            * exp(-age * 1.25) * smoothstep(0.0, 0.12, age);
                        disturbance += delta / max(radius, 0.001) / metric * wave * 0.012;
                    }
                }
                // Taper at the frame to avoid pulling stretched texture edges into view.
                float edge = smoothstep(0.0, 0.09,
                    min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y)));
                disturbance = clamp(disturbance, vec2(-0.025), vec2(0.025)) * edge;
                drift += (pointer.xy - 0.5) * pointer.z * 0.018;
                float zoom = 1.04 + sin(time * 0.06) * 0.006;
                vec2 sampleUV = (uv - 0.5 + flow + drift + disturbance) * cover / zoom + 0.5;
                gl_FragColor = texture2D(ocean, sampleUV);
            }
        `);
        const program = gl.createProgram();
        gl.attachShader(program, vertex);
        gl.attachShader(program, fragment);
        gl.linkProgram(program);
        gl.deleteShader(vertex);
        gl.deleteShader(fragment);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error('Ocean program unavailable');
        }
        gl.useProgram(program);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
        gl.uniform1i(gl.getUniformLocation(program, 'ocean'), 0);
        const timeLocation = gl.getUniformLocation(program, 'time');
        const coverLocation = gl.getUniformLocation(program, 'cover');
        const aspectLocation = gl.getUniformLocation(program, 'aspect');
        const pointerLocation = gl.getUniformLocation(program, 'pointer');
        const ripplesLocation = gl.getUniformLocation(program, 'ripples[0]');

        function draw(time) {
            const width = artwork.clientWidth;
            const height = artwork.clientHeight;
            if (!width || !height) return;
            const ratio = Math.min(window.devicePixelRatio || 1, 1.5, 1800 / Math.max(width, height));
            const pixelWidth = Math.round(width * ratio);
            const pixelHeight = Math.round(height * ratio);
            if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
                canvas.width = pixelWidth;
                canvas.height = pixelHeight;
                gl.viewport(0, 0, pixelWidth, pixelHeight);
            }
            const aspect = (width / height) / (image.naturalWidth / image.naturalHeight);
            gl.uniform2f(coverLocation, Math.min(aspect, 1), Math.min(1 / aspect, 1));
            gl.uniform1f(timeLocation, time);
            gl.uniform1f(aspectLocation, width / height);
            gl.uniform3f(pointerLocation, pointer.x, pointer.y, pointer.strength);
            rippleData.fill(0);
            ripples.forEach((ripple, index) => {
                rippleData.set([ripple.x, ripple.y, time - ripple.started, 1], index * 4);
            });
            gl.uniform4fv(ripplesLocation, rippleData);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        }
        return { draw };
    }

    function stop() {
        cancelAnimationFrame(frame);
        frame = 0;
        lastTime = 0;
    }

    function tick(now) {
        frame = requestAnimationFrame(tick);
        if (lastTime && now - lastTime < 1000 / 30) return;
        const delta = lastTime ? Math.min(now - lastTime, 100) / 1000 : 0;
        elapsed += delta;
        const follow = 1 - Math.exp(-delta * 6);
        pointer.x += (pointer.targetX - pointer.x) * follow;
        pointer.y += (pointer.targetY - pointer.y) * follow;
        pointer.strength += (pointer.targetStrength - pointer.strength) * follow;
        while (ripples.length && elapsed - ripples[0].started >= 4) ripples.shift();
        lastTime = now;
        renderer.draw(elapsed);
    }

    function sync() {
        stop();
        if (failed || !image.complete || !image.naturalWidth) return;
        artwork.classList.toggle('ocean-running', !reducedMotion.matches);
        button.hidden = reducedMotion.matches;
        interaction.hidden = true;
        if (reducedMotion.matches) {
            resetPointer();
            pointer.x = pointer.y = 0.5;
            pointer.strength = 0;
            ripples.length = 0;
            return;
        }
        try {
            renderer ??= createRenderer();
            renderer.draw(elapsed);
            interaction.hidden = paused;
            if (visible && !document.hidden && !paused) frame = requestAnimationFrame(tick);
        } catch {
            // The original image remains visible if GPU rendering is unavailable.
            failed = true;
            artwork.classList.remove('ocean-running');
            button.hidden = true;
            interaction.hidden = true;
        }
    }

    interaction.addEventListener('pointerenter', movePointer);
    interaction.addEventListener('pointermove', movePointer);
    interaction.addEventListener('pointerleave', resetPointer);
    interaction.addEventListener('pointercancel', resetPointer);
    interaction.addEventListener('click', addRipple);
    button.addEventListener('click', () => {
        paused = !paused;
        resetPointer();
        button.setAttribute('aria-pressed', String(paused));
        button.setAttribute('aria-label', paused ? 'Play ocean animation' : 'Pause ocean animation');
        sync();
    });
    image.addEventListener('load', sync, { once: true });
    reducedMotion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) resetPointer();
        sync();
    });
    canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        stop();
        failed = true;
        artwork.classList.remove('ocean-running');
        button.hidden = true;
        interaction.hidden = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
        failed = false;
        renderer = undefined;
        sync();
    });
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
            visible = entries[0].isIntersecting;
            if (!visible) resetPointer();
            sync();
        }).observe(artwork);
    }
    if ('ResizeObserver' in window) new ResizeObserver(sync).observe(artwork);
    else window.addEventListener('resize', sync);
    sync();
})();
