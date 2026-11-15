/* Shared, DOM-independent timeline calculations. Seconds are the storage unit. */
(function (root) {
  'use strict';
  const FPS = 30, FRAME = 1 / FPS;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  function range(original, mode, delta, limits = {}) {
    let { start, source, duration } = original;
    const min = limits.min ?? 0, max = limits.max ?? Infinity;
    const media = Number.isFinite(limits.source), length = limits.source ?? Infinity;
    const minimum = Math.min(FRAME, duration);
    if (mode === 'move') start = clamp(start + delta, min, Math.max(min, max - duration));
    if (mode === 'left') {
      const shift = clamp(delta, Math.max(min - start, media ? -source : -Infinity), duration - minimum);
      start += shift; duration -= shift; if (media) source += shift;
    }
    if (mode === 'right') duration = clamp(duration + delta, minimum, Math.min(length - source, max - start));
    if (mode === 'slip') source = clamp(source + delta, 0, Math.max(0, length - duration));
    return { start, source, duration };
  }
  function snap(state, mode, targets, tolerance, limits = {}, enabled = true) {
    if (!enabled || mode === 'slip') return { state, target: null };
    const edges = mode === 'left' ? [state.start] : mode === 'right' ? [state.start + state.duration] : [state.start, state.start + state.duration];
    let best;
    for (const edge of edges) for (const target of targets) {
      const delta = target - edge;
      if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, target };
    }
    // With snapping enabled, fall back to the nearest project frame.
    if (!best) { const edge = edges[0]; best = { delta: Math.round(edge * FPS) / FPS - edge, target: null }; }
    const next = range(state, mode, best.delta, limits);
    const actual = mode === 'right' ? next.duration - state.duration : next.start - state.start;
    return { state: next, target: Math.abs(actual - best.delta) < .00001 ? best.target : null };
  }
  function reorder(keys, key, target, above) {
    if (key === target || !keys.includes(key) || !keys.includes(target)) return keys.slice();
    const next = keys.filter(k => k !== key);
    next.splice(next.indexOf(target) + (above ? 1 : 0), 0, key);
    return next;
  }
  function transition(a, b, duration) {
    if (!Number.isFinite(duration) || duration < FRAME) throw Error('Choose a duration of at least one frame.');
    if (duration > Math.min(a.end - a.start, b.end - b.start)) throw Error('Transition must fit inside both clips.');
    let start = b.start;
    if (Math.min(a.end, b.end) - Math.max(a.start, b.start) < duration - .00001) start = a.end - duration;
    return { start, end: start + b.end - b.start, duration };
  }
  function isImageLayer(layer, key, asset) {
    return !!layer && (layer.kind === 'image' || asset?.tagName === 'IMG' ||
      (['Logo','Watermark','Ad'].includes(key) && asset?.tagName !== 'VIDEO'));
  }
  const api = { FPS, FRAME, range, snap, reorder, transition, isImageLayer };
  if (typeof module !== 'undefined') module.exports = api;
  else root.FrameCastCore = api;
})(typeof window === 'undefined' ? globalThis : window);
