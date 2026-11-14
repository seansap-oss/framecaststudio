const test = require('node:test');
const assert = require('node:assert/strict');
const { range, snap, reorder, transition, FRAME } = require('../editor-core.js');
const original = { start: 5, source: 2, duration: 8 };
const limits = { min: 0, max: Infinity, source: 20 };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
test('moving a clip preserves source and duration and cannot go before zero', () => {
  assert.deepEqual(range(original, 'move', -9, limits), { start: 0, source: 2, duration: 8 });
});
test('left trim preserves the source end and timeline end', () => {
  const next = range(original, 'left', 3, limits);
  assert.deepEqual(next, { start: 8, source: 5, duration: 5 });
  assert.equal(next.start + next.duration, 13);
  assert.equal(next.source + next.duration, 10);
});
test('left extension stops at the beginning of source media', () => {
  assert.deepEqual(range(original, 'left', -4, limits), { start: 3, source: 0, duration: 10 });
});
test('right extension cannot exceed available source', () => {
  assert.equal(range(original, 'right', 100, limits).duration, 18);
});
test('trimming retains at least one frame', () => {
  close(range(original, 'right', -100, limits).duration, FRAME);
  close(range(original, 'left', 100, limits).duration, FRAME);
});
test('moving can snap the trailing edge to another track without changing source', () => {
  const result = snap(original, 'move', [13.05], .1, limits);
  close(result.state.start, 5.05);
  assert.equal(result.state.duration, 8);
  assert.equal(result.state.source, 2);
  assert.equal(result.target, 13.05);
});
test('Alt or disabled snapping does not quantize movement', () => {
  const state = { ...original, start: 5.017 };
  assert.deepEqual(snap(state, 'move', [5], 1, limits, false), { state, target: null });
});
test('snapping never violates the available source on an edge trim', () => {
  const result = snap({ start: 0, source: 0, duration: 20 }, 'right', [20.05], .1, limits);
  assert.equal(result.state.duration, 20);
  assert.equal(result.target, null);
});
test('layer reordering changes the render stack and retains all other layers', () => {
  assert.deepEqual(reorder(['background', 'video', 'title', 'ticker'], 'video', 'ticker', true), ['background', 'title', 'ticker', 'video']);
  assert.deepEqual(reorder(['background', 'title', 'ticker', 'video'], 'video', 'title', false), ['background', 'video', 'title', 'ticker']);
});
test('missing drag target cannot remove a layer', () => {
  assert.deepEqual(reorder(['a','b'], 'a', 'missing', true), ['a','b']);
});
test('transition between adjacent clips makes an overlap while preserving duration', () => {
  assert.deepEqual(transition({start:0,end:8},{start:8,end:13},1), {start:7,end:12,duration:1});
});
test('transition on an existing overlap leaves clip timing intact', () => {
  assert.deepEqual(transition({start:0,end:8},{start:6,end:11},1), {start:6,end:11,duration:1});
});
test('transitions reject impossible durations', () => {
  for (const duration of [0, -1, NaN, 6]) assert.throws(() => transition({start:0,end:8},{start:8,end:13},duration));
});
