import test from 'node:test'
import assert from 'node:assert'
import { createState, step, autopilotDecide } from './sim.js'
import { createRecorder } from './replay.js'

function seeded(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const free = { gap: 120, v: null, blocked: false }
const blocked = { gap: 120, v: null, blocked: true }

test('autopilot survives 10 minutes of traffic on 50 different roads', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const rng = seeded(seed)
    const state = createState(rng)
    for (let i = 0; i < 600 * 60; i++) step(state, 1 / 60, rng)
    assert.strictEqual(state.crashed, false, 'crashed on seed ' + seed)
  }
})

test('autopilot slows down for a slow car close ahead', () => {
  const state = createState()
  state.lane = 1
  state.speed = 25
  state.laneCooldown = 0
  const sensors = [blocked, { gap: 30, v: 10, blocked: false }, blocked]
  const decision = autopilotDecide(state, sensors)
  assert.notStrictEqual(decision.mode, 'CRUISING')
  assert.ok(decision.speed <= 10, 'target speed should not exceed the car ahead')
  assert.strictEqual(decision.lane, 1)
})

test('autopilot overtakes when the next lane is clear', () => {
  const state = createState()
  state.lane = 1
  state.speed = 25
  state.laneCooldown = 0
  const sensors = [free, { gap: 50, v: 10, blocked: false }, blocked]
  const decision = autopilotDecide(state, sensors)
  assert.strictEqual(decision.mode, 'CHANGING LANE')
  assert.strictEqual(decision.lane, 0)
})

test('autopilot never moves into a blocked lane', () => {
  const state = createState()
  state.lane = 1
  state.speed = 25
  state.laneCooldown = 0
  const sensors = [blocked, { gap: 50, v: 10, blocked: false }, blocked]
  const decision = autopilotDecide(state, sensors)
  assert.strictEqual(decision.lane, 1)
})

test('replay: rewinding returns the exact earlier moment', () => {
  const rng = seeded(7)
  const recorder = createRecorder(200)
  const state = createState(rng)
  recorder.record(state)
  for (let i = 0; i < 500; i++) {
    step(state, 1 / 60, rng)
    recorder.record(state)
  }
  assert.strictEqual(recorder.length, 200, 'buffer keeps only the most recent frames')
  const earlier = recorder.at(100)
  const restored = recorder.rewindTo(100)
  assert.deepStrictEqual(restored, earlier)
  assert.strictEqual(recorder.length, 101, 'frames after the rewind point are dropped')
})
