// Pure simulation logic. No 3D code in this file, so it can be tested on its own.
// The camera looks down +z, so +x appears on the LEFT of the screen.
// Lane 0 = left, lane 1 = middle, lane 2 = right.
export const LANES = [3.5, 0, -3.5]
export const LANE_SPEED = [10, 13, 16] // every car in a lane drives at that lane's speed (m/s)
export const CAR_LENGTH = 4.2
export const SENSOR_RANGE = 120
export const CRUISE_SPEED = 25
export const TRAFFIC_COUNT = 6

const MAX_ACCEL = 3
const COMFORT_BRAKE = 3.5
const MAX_BRAKE = 9

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

function respawn(state, car, rng, zMin, zMax) {
  for (let i = 0; i < 12; i++) {
    const lane = Math.floor(rng() * 3)
    const z = zMin + rng() * (zMax - zMin)
    const clash = state.traffic.some((o) => o !== car && o.lane === lane && Math.abs(o.z - z) < 40)
    if (!clash) {
      Object.assign(car, { lane, x: LANES[lane], z, v: LANE_SPEED[lane] })
      return
    }
  }
  Object.assign(car, { lane: 1, x: LANES[1], z: zMax + 60, v: LANE_SPEED[1] })
}

export function createState(rng = Math.random) {
  const state = {
    time: 0,
    distance: 0,
    speed: 20,
    lane: 1,
    carX: 0,
    crashed: false,
    autopilot: true,
    mode: 'CRUISING',
    laneCooldown: 0,
    sensors: null,
    traffic: [],
  }
  for (let i = 0; i < TRAFFIC_COUNT; i++) {
    state.traffic.push({ lane: 1, x: 0, z: -999, v: 0 })
  }
  for (const car of state.traffic) respawn(state, car, rng, 40, 200)
  state.sensors = readSensors(state)
  return state
}

// What the car "sees": for each lane, the gap to the nearest car ahead
// and whether that lane is unsafe to move into.
export function readSensors(state) {
  const lanes = LANES.map(() => ({ gap: SENSOR_RANGE, v: null, blocked: false }))
  for (const t of state.traffic) {
    const s = lanes[t.lane]
    if (t.z > 0) {
      const gap = Math.max(t.z - CAR_LENGTH, 0)
      if (gap < s.gap) { s.gap = gap; s.v = t.v }
    }
    if (t.z > -20 && t.z < 8) s.blocked = true
    else if (t.z <= -20 && t.v > state.speed && -t.z / (t.v - state.speed) < 6) s.blocked = true
  }
  return lanes
}

// The autopilot's brain: sensors in, decision out.
export function autopilotDecide(state, sensors) {
  const lane = state.lane
  const me = sensors[lane]
  const followDist = 8 + state.speed * 2
  const lead = me.v ?? CRUISE_SPEED
  const closing = Math.max(state.speed - lead, 0.1)
  const ttc = me.gap / closing

  if (me.v !== null && (ttc < 2.5 || me.gap < 8)) {
    return { lane, speed: Math.max(0, lead - 3), mode: 'EMERGENCY BRAKE' }
  }
  if (me.gap < followDist) {
    if (state.laneCooldown <= 0) {
      const options = [lane - 1, lane + 1].filter(
        (l) => l >= 0 && l <= 2 && !sensors[l].blocked && sensors[l].gap > followDist * 1.2,
      )
      if (options.length) {
        options.sort((a, b) => sensors[b].gap - sensors[a].gap)
        return { lane: options[0], speed: Math.min(CRUISE_SPEED, state.speed), mode: 'CHANGING LANE' }
      }
    }
    return { lane, speed: Math.min(CRUISE_SPEED, lead), mode: 'FOLLOWING' }
  }
  return { lane, speed: CRUISE_SPEED, mode: 'CRUISING' }
}

export function step(state, dt, rng = Math.random) {
  if (state.crashed) return
  state.time += dt
  state.distance += state.speed * dt
  state.laneCooldown = Math.max(0, state.laneCooldown - dt)
  state.sensors = readSensors(state)

  if (state.autopilot) {
    const d = autopilotDecide(state, state.sensors)
    if (d.lane !== state.lane) {
      state.lane = d.lane
      state.laneCooldown = 3
    }
    state.mode = d.mode
    const limit = d.mode === 'EMERGENCY BRAKE' ? MAX_BRAKE : COMFORT_BRAKE
    const accel = clamp((d.speed - state.speed) * 1.2, -limit, MAX_ACCEL)
    state.speed = Math.max(0, state.speed + accel * dt)
  } else {
    state.mode = 'MANUAL'
  }

  state.carX += (LANES[state.lane] - state.carX) * Math.min(1, 6 * dt)

  for (const t of state.traffic) {
    t.z -= (state.speed - t.v) * dt
    if (t.z < -20) respawn(state, t, rng, 150, 230)
    if (Math.abs(t.x - state.carX) < 1.8 && Math.abs(t.z) < CAR_LENGTH) state.crashed = true
  }
}

