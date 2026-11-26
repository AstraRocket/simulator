/*
  Browser capability checks, shared by index.html (the startup gate) and compatibility.html.
  ES5 on purpose: it must run in the old browsers it rejects. Callers pass the storage prefix,
  since files in public/ are served untouched and never see the %STORAGE_PREFIX% substitution.
*/
(function (g) {
  /* Below this, the 3D views are switched off. Frames per second in gpuBench's test scene. */
  var GPU_MIN_FPS = 30;
  /* Bump when a check or gpuBench's scene changes, so a result stored by the old code is not reused. */
  var RESULT_KEY = ':compat-result:v1';
  var MODE_KEY = ':graphics';

  function modernJs() {
    try {
      return new Function(
        'class A { #x = 1; static { this.y = 2; } get x() { return this.#x; } }' +
          'return new A().x === 1 && A.y === 2 && [1, 2].at(-1) === 2 && Object.hasOwn({ a: 1 }, "a") && (null ?? 1) === 1;',
      )();
    } catch (e) {
      return false;
    }
  }

  function modernCss() {
    var c = g.CSS;
    return !!(
      c &&
      c.supports &&
      c.supports('color', 'oklch(0.6 0.1 200)') &&
      c.supports('color', 'color-mix(in oklab, red, blue)') &&
      typeof c.registerProperty === 'function'
    );
  }

  function moduleWorkers() {
    if (typeof Worker === 'undefined' || !g.URL || !g.Blob) return false;
    var supported = false;
    try {
      var url = URL.createObjectURL(new Blob([''], { type: 'text/javascript' }));
      var w = new Worker(url, {
        get type() {
          supported = true;
          return 'module';
        },
      });
      w.terminate();
      URL.revokeObjectURL(url);
    } catch (e) {}
    return supported;
  }

  function wasmGc() {
    try {
      /* One struct type with an i8 field: only a WASM-GC engine validates it. */
      return (
        typeof WebAssembly === 'object' &&
        typeof WebAssembly.compileStreaming === 'function' &&
        WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 95, 1, 120, 0]))
      );
    } catch (e) {
      return false;
    }
  }

  function localStorageWorks(prefix) {
    try {
      var k = prefix + ':compat-probe';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function write(key, value) {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (e) {}
  }

  /* What the app cannot start without. `blocked` is true when any is missing. */
  function requirements(prefix) {
    var list = [
      { id: 'js', ok: modernJs() },
      { id: 'css', ok: modernCss() },
      { id: 'workers', ok: moduleWorkers() },
      { id: 'storage', ok: localStorageWorks(prefix) },
    ];
    var blocked = false;
    for (var i = 0; i < list.length; i++) if (!list[i].ok) blocked = true;
    return { list: list, blocked: blocked };
  }

  function loseContext(gl) {
    var lose = gl && gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
  }

  /* cspell:disable -- WebGL extension and driver names. */
  function webglInfo() {
    var gl = null;
    var v2 = false;
    try {
      var c = document.createElement('canvas');
      gl = c.getContext('webgl2');
      v2 = !!gl;
      if (!gl) gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    } catch (e) {}
    if (!gl) return null;
    var dbg = gl.getExtension('WEBGL_debug_renderer_info');
    var renderer = String((dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
    var vendor = String((dbg && gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) || gl.getParameter(gl.VENDOR) || '');
    var fast = null;
    try {
      fast = document
        .createElement('canvas')
        .getContext(v2 ? 'webgl2' : 'webgl', { failIfMajorPerformanceCaveat: true });
    } catch (e) {}
    var hardware = !!fast && !/SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(renderer);
    loseContext(fast);
    return { gl: gl, webgl2: v2, renderer: renderer, vendor: vendor, hardware: hardware };
  }

  /* Frames per second drawing a shader-heavy full-screen scene, or null without WebGL. */
  function gpuBench(ms) {
    var c = document.createElement('canvas');
    c.width = 1024;
    c.height = 1024;
    var gl = null;
    try {
      gl = c.getContext('webgl', { antialias: false, preserveDrawingBuffer: false });
    } catch (e) {}
    if (!gl) return null;
    var vs = 'attribute vec2 p; varying vec2 v; void main() { v = p; gl_Position = vec4(p, 0.0, 1.0); }';
    var fs =
      'precision mediump float; varying vec2 v; uniform float t;' +
      'void main() { vec3 c = vec3(0.0); vec2 q = v * 3.0;' +
      'for (int i = 0; i < 64; i++) { float f = float(i);' +
      'q = vec2(q.x * cos(t + f) - q.y * sin(t), q.x * sin(t) + q.y * cos(t + f)) * 0.97 + 0.03;' +
      'c += 0.015 * vec3(abs(sin(q.x)), abs(cos(q.y)), abs(sin(q.x + q.y))); }' +
      'gl_FragColor = vec4(c, 1.0); }';
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    }
    var prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      loseContext(gl);
      return null;
    }
    gl.useProgram(prog);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var tLoc = gl.getUniformLocation(prog, 't');
    var px = new Uint8Array(4);
    var frames = 0;
    var start = performance.now();
    var now = start;
    while (now - start < ms && frames < 5000) {
      for (var k = 0; k < 4; k++) {
        gl.uniform1f(tLoc, frames * 0.01 + k);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      frames++;
      now = performance.now();
    }
    loseContext(gl);
    return frames / ((now - start) / 1000);
  }
  /* cspell:enable */

  /* RK4 steps per second on a point-mass flight: the processor-bound side of a simulation. */
  function cpuBench(ms) {
    var dt = 0.001;
    var steps = 0;
    var s0 = 0;
    var s1 = 0;
    function acc(t, y0, y1) {
      var thrust = t < 1.5 ? 12 : 0;
      var m = 0.1 - Math.min(t, 1.5) * 0.01;
      var drag = 0.0006 * y1 * Math.abs(y1) * Math.exp(-y0 / 8000);
      return (thrust - drag) / m - 9.80665;
    }
    var start = performance.now();
    var now = start;
    while (now - start < ms) {
      for (var i = 0; i < 2000; i++) {
        if (steps % 20000 === 0) {
          s0 = 0;
          s1 = 0;
        }
        var t = (steps % 20000) * dt;
        var a1 = acc(t, s0, s1);
        var a2 = acc(t + dt / 2, s0 + (s1 * dt) / 2, s1 + (a1 * dt) / 2);
        var a3 = acc(t + dt / 2, s0 + ((s1 + (a1 * dt) / 2) * dt) / 2, s1 + (a2 * dt) / 2);
        var a4 = acc(t + dt, s0 + (s1 + (a2 * dt) / 2) * dt, s1 + a3 * dt);
        s0 += s1 * dt + ((a1 + a2 + a3) * dt * dt) / 6;
        s1 += ((a1 + 2 * a2 + 2 * a3 + a4) * dt) / 6;
        steps++;
      }
      now = performance.now();
    }
    return steps / ((now - start) / 1000);
  }

  /** 'auto' | 'on' | 'off', as chosen on the compatibility page. */
  function graphicsMode(prefix) {
    var m = read(prefix + MODE_KEY);
    return m === 'on' || m === 'off' ? m : 'auto';
  }

  function setGraphicsMode(prefix, mode) {
    write(prefix + MODE_KEY, mode === 'on' || mode === 'off' ? mode : null);
  }

  /*
    The stored check result, reused instead of rerunning the checks. It stays valid only for the
    browser version and graphics driver it was taken on: a browser update can change the answer.
  */
  function signature() {
    var info = webglInfo();
    if (info) loseContext(info.gl);
    return {
      sig: navigator.userAgent + '|' + (info ? info.renderer + '|' + info.vendor : 'no-webgl'),
      webgl: !!info,
    };
  }

  function loadResult(prefix, sig) {
    var r = null;
    try {
      r = JSON.parse(read(prefix + RESULT_KEY) || 'null');
    } catch (e) {}
    return r && r.sig === sig ? r : null;
  }

  function saveResult(prefix, result) {
    write(prefix + RESULT_KEY, JSON.stringify(result));
  }

  function clearResult(prefix) {
    write(prefix + RESULT_KEY, null);
  }

  /*
    Whether the app's 3D views run, from a result's WebGL flag and measured speed, and the mode set by hand.
    reason: null (on), 'none' (no WebGL), 'slow' (under GPU_MIN_FPS), 'off' (turned off by hand).
  */
  function decide(prefix, result) {
    var mode = graphicsMode(prefix);
    var fps = typeof result.fps === 'number' ? result.fps : null;
    var out = { enabled: true, reason: null, mode: mode, fps: fps, minFps: GPU_MIN_FPS };
    if (!result.webgl) {
      out.enabled = false;
      out.reason = 'none';
    } else if (mode === 'off') {
      out.enabled = false;
      out.reason = 'off';
    } else if (mode === 'auto' && fps != null && fps < GPU_MIN_FPS) {
      out.enabled = false;
      out.reason = 'slow';
    }
    return out;
  }

  /*
    The startup gate's answer: the stored result when there is one, otherwise a short check that is
    then stored. The speed test only runs when the mode is automatic, since a mode set by hand ignores it.
  */
  function startup(prefix) {
    var s = signature();
    var r = loadResult(prefix, s.sig);
    var changed = false;
    if (!r) {
      r = { sig: s.sig, at: new Date().getTime(), blocked: requirements(prefix).blocked, webgl: s.webgl, fps: null };
      changed = true;
    }
    if (r.webgl && typeof r.fps !== 'number' && graphicsMode(prefix) === 'auto') {
      r.fps = gpuBench(300);
      changed = true;
    }
    if (changed) saveResult(prefix, r);
    return { blocked: !!r.blocked, graphics: decide(prefix, r) };
  }

  g.AstraCapability = {
    GPU_MIN_FPS: GPU_MIN_FPS,
    modernJs: modernJs,
    modernCss: modernCss,
    moduleWorkers: moduleWorkers,
    wasmGc: wasmGc,
    localStorageWorks: localStorageWorks,
    requirements: requirements,
    webglInfo: webglInfo,
    gpuBench: gpuBench,
    cpuBench: cpuBench,
    graphicsMode: graphicsMode,
    setGraphicsMode: setGraphicsMode,
    signature: signature,
    loadResult: loadResult,
    saveResult: saveResult,
    clearResult: clearResult,
    decide: decide,
    startup: startup,
  };
})(window);
