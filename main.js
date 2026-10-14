import * as THREE from 'three'
import { LANES, TRAFFIC_COUNT, CAR_LENGTH, createState, step } from './sim.js'
import { createRecorder } from './replay.js'

const recorder = createRecorder()
let state = createState()
recorder.record(state)
let replay = false
let replayIndex = 0

function reset() {
  state = createState()
  recorder.clear()
  recorder.record(state)
  replay = false
}

function togglePause() {
  if (!replay) {
    replay = true
    replayIndex = recorder.length - 1
  } else {
    state = recorder.rewindTo(replayIndex)
    replay = false
  }
}

// ===================== INPUT =====================
addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase()
  if (k === 'r') { reset(); return }
  if (k === ' ') { e.preventDefault(); togglePause(); return }
  if (replay) return
  if (k === 'p') { state.autopilot = !state.autopilot; return }
  if (k === 'arrowleft' || k === 'a') { state.autopilot = false; state.lane = Math.max(0, state.lane - 1) }
  if (k === 'arrowright' || k === 'd') { state.autopilot = false; state.lane = Math.min(2, state.lane + 1) }
  if (k === 'arrowup') { state.autopilot = false; state.speed = Math.min(35, state.speed + 2) }
  if (k === 'arrowdown') { state.autopilot = false; state.speed = Math.max(0, state.speed - 2) }
  if (k.startsWith('arrow')) e.preventDefault()
})

// ===================== 3D SCENE =====================
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0b0f14)
scene.fog = new THREE.Fog(0x0b0f14, 30, 130)

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 300)
camera.position.set(0, 4, -9)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setSize(innerWidth, innerHeight)
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
document.body.appendChild(renderer.domElement)

scene.add(new THREE.AmbientLight(0xffffff, 0.7))
const sun = new THREE.DirectionalLight(0xffffff, 1.2)
sun.position.set(10, 20, -10)
scene.add(sun)

const road = new THREE.Mesh(
  new THREE.PlaneGeometry(10.5, 400),
  new THREE.MeshStandardMaterial({ color: 0x1b222b }),
)
road.rotation.x = -Math.PI / 2
road.position.z = 90
scene.add(road)

const lineMat = new THREE.MeshBasicMaterial({ color: 0xcfd8e3 })
const dashes = []
for (const x of [-1.75, 1.75]) {
  for (let z = -20; z < 180; z += 8) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 3), lineMat)
    dash.rotation.x = -Math.PI / 2
    dash.position.set(x, 0.01, z)
    dash.userData.z0 = z
    scene.add(dash)
    dashes.push(dash)
  }
}

function makeCar(color) {
  const car = new THREE.Group()
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 4.2), new THREE.MeshStandardMaterial({ color }))
  body.position.y = 0.5
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2), new THREE.MeshStandardMaterial({ color: 0x2b3440 }))
  cabin.position.set(0, 1.05, -0.2)
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xff3b3b })
  for (const x of [-0.65, 0.65]) {
    const light = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.05), lightMat)
    light.position.set(x, 0.6, -2.12)
    car.add(light)
  }
  car.add(body, cabin)
  return car
}

const playerCar = makeCar(0xe8edf2)
scene.add(playerCar)

const trafficColors = [0x5b6b7c, 0x7a3b3b, 0x3b5f7a, 0x6a6a3b, 0x4b3b7a, 0x3b7a5f]
const trafficCars = []
for (let i = 0; i < TRAFFIC_COUNT; i++) {
  const m = makeCar(trafficColors[i % trafficColors.length])
  scene.add(m)
  trafficCars.push(m)
}

// Sensor beams: one per lane, as long as the free road ahead in that lane
const beams = LANES.map((x) => {
  const beam = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.04, 1),
    new THREE.MeshBasicMaterial({ color: 0x2dd4bf, transparent: true, opacity: 0.5 }),
  )
  beam.position.set(x, 0.06, 0)
  scene.add(beam)
  return beam
})

// ===================== HUD =====================
const hud = document.createElement('div')
hud.style.cssText =
  'position:fixed;top:16px;left:16px;color:#5eead4;font:14px monospace;line-height:1.7;' +
  'background:rgba(10,25,47,0.75);padding:10px 14px;border:1px solid rgba(94,234,212,0.3);border-radius:8px'
document.body.appendChild(hud)

const banner = document.createElement('div')
banner.style.cssText =
  'position:fixed;top:40%;width:100%;text-align:center;color:#f87171;font:bold 32px monospace;display:none'
banner.textContent = 'CRASH - rewind with the slider or press R'
document.body.appendChild(banner)

// ===================== REPLAY BAR =====================
const bar = document.createElement('div')
bar.style.cssText =
  'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);width:min(720px,90vw);' +
  'display:flex;align-items:center;gap:12px;background:rgba(10,25,47,0.85);' +
  'border:1px solid rgba(94,234,212,0.3);border-radius:10px;padding:10px 14px;' +
  'color:#5eead4;font:13px monospace'
const pauseBtn = document.createElement('button')
pauseBtn.style.cssText =
  'background:transparent;color:#5eead4;border:1px solid rgba(94,234,212,0.5);' +
  'border-radius:6px;padding:6px 12px;font:13px monospace;cursor:pointer;min-width:140px'
const slider = document.createElement('input')
slider.type = 'range'
slider.min = 0
slider.max = 0
slider.value = 0
slider.style.cssText = 'flex:1;accent-color:#2dd4bf'
const timeLabel = document.createElement('span')
timeLabel.style.cssText = 'min-width:70px;text-align:right'
bar.append(pauseBtn, slider, timeLabel)
document.body.appendChild(bar)

pauseBtn.addEventListener('click', () => { togglePause(); pauseBtn.blur() })
slider.addEventListener('input', () => {
  replay = true
  replayIndex = Number(slider.value)
})
slider.addEventListener('change', () => slider.blur())

function beamColor(gap) {
  if (gap < 25) return 0xf87171
  if (gap < 55) return 0xfbbf24
  return 0x2dd4bf
}

// ===================== LOOP =====================
const clock = new THREE.Clock()

function draw(view) {
  for (const d of dashes) {
    const offset = (((d.userData.z0 + 20 - view.distance) % 200) + 200) % 200
    d.position.z = offset - 20
  }

  playerCar.position.x = view.carX
  playerCar.rotation.y = (LANES[view.lane] - view.carX) * 0.06
  view.traffic.forEach((t, i) => trafficCars[i].position.set(t.x, 0, t.z))

  view.sensors.forEach((s, i) => {
    beams[i].scale.z = Math.max(s.gap, 0.1)
    beams[i].position.z = CAR_LENGTH / 2 + s.gap / 2
    beams[i].material.color.setHex(beamColor(s.gap))
    beams[i].material.opacity = i === view.lane ? 0.9 : 0.3
  })

  camera.position.x = view.carX * 0.6
  camera.lookAt(view.carX * 0.3, 1, 10)

  const gap = view.sensors[view.lane].gap
  const modeColor = view.mode === 'EMERGENCY BRAKE' ? '#f87171' : view.mode === 'MANUAL' ? '#94a3b8' : '#5eead4'
  hud.innerHTML =
    'Autopilot: <b style="color:' + (view.autopilot ? '#5eead4' : '#94a3b8') + '">' + (view.autopilot ? 'ON' : 'OFF') + '</b><br>' +
    'Mode: <b style="color:' + modeColor + '">' + view.mode + '</b><br>' +
    'Speed: ' + Math.round(view.speed * 3.6) + ' km/h<br>' +
    'Gap ahead: ' + (gap >= 119 ? '120+' : Math.round(gap)) + ' m<br>' +
    'Time: ' + view.time.toFixed(1) + ' s<br>' +
    '<span style="color:#64748b">P autopilot | arrows steer/speed | Space pause | R restart</span>'
  banner.style.display = view.crashed ? 'block' : 'none'
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05)

  if (!replay) {
    const wasCrashed = state.crashed
    step(state, dt)
    if (!wasCrashed) recorder.record(state)
  }

  const view = replay ? recorder.at(replayIndex) : state
  draw(view)

  slider.max = recorder.length - 1
  slider.value = replay ? replayIndex : recorder.length - 1
  timeLabel.textContent = replay ? '-' + (recorder.last().time - view.time).toFixed(1) + ' s' : 'LIVE'
  pauseBtn.textContent = replay ? 'Resume from here' : 'Pause'

  renderer.render(scene, camera)
  requestAnimationFrame(animate)
}
animate()

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})
