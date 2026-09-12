import RAPIER from '@dimforge/rapier3d-compat'
import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import GUI from 'lil-gui'
import Stats from 'stats-gl'
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js'
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js'
import { TransmissionMaterial } from './TransmissionMaterial.js'
import { FixedTimestep } from './FixedTimestep.js'

// ─── Rapier physics ─────────────────────────────────────────────────────────
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

function signalReady() {
  window.dispatchEvent(new Event('lumi:ready'))
}

await RAPIER.init()
const gravity = new RAPIER.Vector3(0, 0, 0)
const world = new RAPIER.World(gravity)

// ─── Scene setup ─────────────────────────────────────────────────────────────

const renderer = new THREE.WebGPURenderer({ antialias: true })
renderer.toneMapping = THREE.AgXToneMapping
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.domElement.style.cssText = 'position:fixed;top:0;left:0;z-index:0;'
renderer.setSize(window.innerWidth, window.innerHeight)
document.body.appendChild(renderer.domElement)

try {
  await renderer.init()
} catch {
  renderer.domElement.remove()
  document.documentElement.classList.add('no-webgpu')
  signalReady()
  throw new Error('WebGPU unavailable')
}

let stats = null

const scene = new THREE.Scene()

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 100)
camera.position.set(0, 0, 6)

// Debug overlay for OrbitControls
const debugOverlay = document.createElement('div')
debugOverlay.style.cssText = 'position:fixed;inset:0;z-index:1;display:none;'
document.body.appendChild(debugOverlay)

const controls = new OrbitControls(camera, debugOverlay)
controls.target.set(0, 0, 0)
controls.update()

// ─── Params ──────────────────────────────────────────────────────────────────

const params = {
  debug: false,
  background: '#f4efe8',
  toneMapping: 'AgX',
  // Text
  textColor: '#1a1612',
  textSize: 0.28,
  // Material
  blurMode: 'mip', // 'mip' or 'blue'
  color: '#ffffff',
  transmission: 1,
  thickness: 1,
  roughness: 0.25,
  ior: 1.5,
  dispersion: 5,
  frostBlur: 0.21,
  frostNoiseAmplitude: 0.86,
  frostNoiseFrequency: 0.18,
  attenuationColor: '#d7c4a8',
  attenuationDistance: 0.5,
  envMapIntensity: 1,
  iridescence: 2,
  iridescenceIOR: 1,
  iridescenceThicknessMin: 100,
  iridescenceThicknessMax: 400,
  clearcoat: 0,
  clearcoatRoughness: 0,
  specularIntensity: 1,
  specularColor: '#ffffff',
  // Physics
  mouseBallRadius: 1,
  wanderStrength: reducedMotion ? 0 : 0.86,
  wanderSpeed: 0.3,
  attractionStrength: 10,
  linearDamping: 1.4,
  angularDamping: 5.08,
  friction: 0.2,
  restitution: 0.14,
  waterDrag: true,
  waterDragCoefficient: 1.19,
  // Lighting
  ambientIntensity: 0.6,
  spotIntensity: 200,
}

// ─── Background ──────────────────────────────────────────────────────────────

scene.background = new THREE.Color(params.background)

// ─── Lights ──────────────────────────────────────────────────────────────────

const ambientLight = new THREE.AmbientLight('#ffffff', params.ambientIntensity)
scene.add(ambientLight)

const spotLight = new THREE.SpotLight('#ffffff', params.spotIntensity, 0, 0.15, 1)
spotLight.position.set(10, 10, 10)
scene.add(spotLight)

// ─── Procedural environment ──────────────────────────────────────────────────

function createLightformerEnvMap() {
  const envScene = new THREE.Scene()
  const group = new THREE.Group()
  group.rotation.set(-Math.PI / 3, 0, 1)
  envScene.add(group)

  const circleMat = (intensity) =>
    new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity), side: THREE.DoubleSide })
  const circleGeo = new THREE.CircleGeometry(1, 64)

  const lf1 = new THREE.Mesh(circleGeo, circleMat(4))
  lf1.rotation.x = Math.PI / 2
  lf1.position.set(0, 5, -9)
  lf1.scale.setScalar(2)
  group.add(lf1)

  const lf2 = new THREE.Mesh(circleGeo, circleMat(2))
  lf2.rotation.y = Math.PI / 2
  lf2.position.set(-5, 1, -1)
  lf2.scale.setScalar(2)
  group.add(lf2)

  const lf3 = new THREE.Mesh(circleGeo, circleMat(2))
  lf3.rotation.y = Math.PI / 2
  lf3.position.set(-5, -1, -1)
  lf3.scale.setScalar(2)
  group.add(lf3)

  const lf4 = new THREE.Mesh(circleGeo, circleMat(2))
  lf4.rotation.y = -Math.PI / 2
  lf4.position.set(10, 1, 0)
  lf4.scale.setScalar(8)
  group.add(lf4)

  const pmremGenerator = new THREE.PMREMGenerator(renderer)
  const envMap = pmremGenerator.fromScene(envScene, 0, 0.1, 100).texture
  pmremGenerator.dispose()
  envScene.clear()
  return envMap
}

scene.environment = createLightformerEnvMap()

// ─── Text plane behind cubes ─────────────────────────────────────────────────

const textCanvas = document.createElement('canvas')
const textDpr = Math.min(window.devicePixelRatio, 2)
textCanvas.width = window.innerWidth * textDpr
textCanvas.height = window.innerHeight * textDpr
const textCtx = textCanvas.getContext('2d')
let textTexture = new THREE.CanvasTexture(textCanvas)
textTexture.colorSpace = THREE.SRGBColorSpace

function updateTextPlane() {
  const w = textCanvas.width
  const h = textCanvas.height
  textCtx.clearRect(0, 0, w, h)
  textCtx.fillStyle = params.textColor
  textCtx.textBaseline = 'middle'
  textCtx.textAlign = 'center'

  const serif = '"Cormorant Garamond", Georgia, serif'

  textCtx.strokeStyle = params.textColor
  textCtx.globalAlpha = 0.22
  textCtx.lineWidth = 1.5
  textCtx.beginPath()
  textCtx.moveTo(w * 0.08, h * 0.12)
  textCtx.lineTo(w * 0.92, h * 0.12)
  textCtx.stroke()
  textCtx.beginPath()
  textCtx.moveTo(w * 0.08, h * 0.88)
  textCtx.lineTo(w * 0.92, h * 0.88)
  textCtx.stroke()
  textCtx.globalAlpha = 1

  const mainSize = Math.round(h * params.textSize)
  textCtx.font = `italic 300 ${mainSize}px ${serif}`
  textCtx.letterSpacing = '0px'
  textCtx.fillText('Lumi', w / 2, h * 0.22)

  const tagSize = Math.round(h * 0.028)
  textCtx.font = `italic 400 ${tagSize}px ${serif}`
  textCtx.letterSpacing = '6px'
  textCtx.fillText('Салон на Патриарших', w / 2, h * 0.22 + mainSize * 0.62)

  textCtx.letterSpacing = '0px'
  textTexture.needsUpdate = true
}

const textPlaneZ = -3
const textPlaneDistance = camera.position.z - textPlaneZ
const textPlaneHeight = 2 * textPlaneDistance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
const textPlaneAspect = window.innerWidth / window.innerHeight
const textPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(textPlaneHeight * textPlaneAspect, textPlaneHeight),
  new THREE.MeshBasicMaterial({ map: textTexture, transparent: true, depthWrite: false }),
)
textPlane.position.set(0, 0, textPlaneZ)
scene.add(textPlane)

const font = new FontFace(
  'Cormorant Garamond',
  'url(https://fonts.gstatic.com/s/cormorantgaramond/v21/co3smX5slCNuHLi8bLeY9MK7whWMhyjYrGFEsdtdc62E6zd5rDDOjw.ttf)',
  { weight: '300', style: 'italic' },
)
const fontRegular = new FontFace(
  'Cormorant Garamond',
  'url(https://fonts.gstatic.com/s/cormorantgaramond/v21/co3umX5slCNuHLi8bLeY9MK7whWMhyjypVO7abI26QOD_v86GnM.ttf)',
  { weight: '400', style: 'normal' },
)
await Promise.all([font.load(), fontRegular.load()])
document.fonts.add(font)
document.fonts.add(fontRegular)
updateTextPlane()

// ─── Glass material ─────────────────────────────────────────────────────────

const glassMaterial = new TransmissionMaterial(params)

// ─── Load font & create letter bodies ────────────────────────────────────────

const fontLoader = new FontLoader()
const fontData = await new Promise((resolve, reject) => {
  fontLoader.load(
    'https://cdn.jsdelivr.net/npm/three@0.183.2/examples/fonts/droid/droid_serif_bold.typeface.json',
    resolve,
    undefined,
    reject,
  )
})

const letters = ['L', 'U', 'M', 'I']
const letterSize = 1.28
const letterDepth = 0.48
const letterSpacingX = window.innerWidth < 700 ? 1.35 : 1.82

// Build geometries for each letter, centered at origin
const letterGeometries = letters.map((char) => {
  const geo = new TextGeometry(char, {
    font: fontData,
    size: letterSize,
    depth: letterDepth,
    curveSegments: 16,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.04,
    bevelSegments: 4,
  })
  geo.computeBoundingBox()
  const bb = geo.boundingBox
  const cx = (bb.max.x + bb.min.x) / 2
  const cy = (bb.max.y + bb.min.y) / 2
  const cz = (bb.max.z + bb.min.z) / 2
  geo.translate(-cx, -cy, -cz)
  geo.computeBoundingBox()
  return geo
})

// Compute collider half-extents from each letter's bounding box
const letterHalfExtents = letterGeometries.map((geo) => {
  const bb = geo.boundingBox
  return {
    hx: (bb.max.x - bb.min.x) / 2,
    hy: (bb.max.y - bb.min.y) / 2,
    hz: (bb.max.z - bb.min.z) / 2,
  }
})

const letterStartPositions = letters.map((_, i) => [
  (i - 1.5) * letterSpacingX + (Math.random() - 0.5) * 0.12,
  (Math.random() - 0.5) * 0.16,
  (Math.random() - 0.5) * 0.35,
])

const cubeBodies = letterStartPositions.map((pos, i) => {
  const mesh = glassMaterial.createMesh(letterGeometries[i])
  mesh.position.set(...pos)
  mesh.rotation.set(Math.random() * Math.PI * 0.3, Math.random() * Math.PI * 0.3, Math.random() * Math.PI * 0.3)
  scene.add(mesh)

  const { hx, hy, hz } = letterHalfExtents[i]
  const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
    .setRestitution(params.restitution)
    .setFriction(params.friction)

  const rigidBodyDesc = RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(...pos)
    .setLinearDamping(params.linearDamping)
    .setAngularDamping(params.angularDamping)
  const rigidBody = world.createRigidBody(rigidBodyDesc)
  const q = new THREE.Quaternion().setFromEuler(mesh.rotation)
  rigidBody.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
  world.createCollider(colliderDesc, rigidBody)

  return { mesh, rigidBody }
})

// Wander seeds for each letter
const wanderSeeds = cubeBodies.map(() => ({
  ox: Math.random() * 1000,
  oy: Math.random() * 1000,
  oz: Math.random() * 1000,
}))

// ─── Mouse force repulsion ──────────────────────────────────────────────────

const raycaster = new THREE.Raycaster()
const mouseNDC = new THREE.Vector2(-Infinity, -Infinity)
let mouseActive = false

// Invisible plane for raycasting at z=0
const raycastPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(50, 50),
  new THREE.MeshBasicMaterial({ visible: false }),
)
scene.add(raycastPlane)

const mouseWorldPos = new THREE.Vector3(100, 100, 100)

const mouseBallDebugMesh = new THREE.Mesh(
  new THREE.SphereGeometry(params.mouseBallRadius, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true }),
)
mouseBallDebugMesh.visible = false
scene.add(mouseBallDebugMesh)

const scrollHint = document.querySelector('.scroll-hint')
let sceneActive = true

function isHeroVisible() {
  return window.scrollY < window.innerHeight * 0.85
}

window.addEventListener('pointermove', (event) => {
  if (!isHeroVisible()) {
    mouseActive = false
    return
  }
  mouseNDC.set((event.clientX / window.innerWidth) * 2 - 1, -(event.clientY / window.innerHeight) * 2 + 1)
  mouseActive = true
})

window.addEventListener('scroll', () => {
  const fade = Math.min(1, window.scrollY / (window.innerHeight * 0.9))
  renderer.domElement.style.opacity = String(1 - fade)
  sceneActive = fade < 0.98
  if (scrollHint) scrollHint.style.opacity = isHeroVisible() ? '1' : '0'
  if (!isHeroVisible()) mouseActive = false
}, { passive: true })

window.addEventListener('pointerleave', () => {
  mouseActive = false
  mouseWorldPos.set(100, 100, 100)
})

// ─── Wall colliders ─────────────────────────────────────────────────────────

const wallThickness = 2
const zExtent = 0.8 // how far cubes can go forward/back

function createWalls() {
  const vFov = THREE.MathUtils.degToRad(camera.fov / 2)
  const dist = camera.position.z
  const visibleH = 2 * dist * Math.tan(vFov)
  const visibleW = visibleH * camera.aspect
  const halfW = visibleW / 2
  const halfH = visibleH / 2
  const bigHalf = Math.max(halfW, halfH) + wallThickness

  const walls = [
    // Left
    { pos: [-halfW - wallThickness / 2, 0, 0], half: [wallThickness / 2, bigHalf, bigHalf] },
    // Right
    { pos: [halfW + wallThickness / 2, 0, 0], half: [wallThickness / 2, bigHalf, bigHalf] },
    // Top
    { pos: [0, halfH + wallThickness / 2, 0], half: [bigHalf, wallThickness / 2, bigHalf] },
    // Bottom
    { pos: [0, -halfH - wallThickness / 2, 0], half: [bigHalf, wallThickness / 2, bigHalf] },
    // Front (close to camera)
    { pos: [0, 0, zExtent + wallThickness / 2], half: [bigHalf, bigHalf, wallThickness / 2] },
    // Back
    { pos: [0, 0, -zExtent - wallThickness / 2], half: [bigHalf, bigHalf, wallThickness / 2] },
  ]

  return walls.map(({ pos, half }) => {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(...pos)
    const body = world.createRigidBody(bodyDesc)
    const collider = RAPIER.ColliderDesc.cuboid(...half)
      .setRestitution(0.2)
      .setFriction(0.3)
    world.createCollider(collider, body)
    return body
  })
}

let wallBodies = createWalls()

// ─── GUI ─────────────────────────────────────────────────────────────────────

const gui = new GUI({ closeFolders: true })
gui.domElement.style.display = 'none'

function setDebug(v) {
  if (v && !stats) {
    stats = new Stats({ trackGPU: true })
    document.body.appendChild(stats.dom)
    stats.init(renderer)
  }
  if (stats) stats.dom.style.display = v ? '' : 'none'
  debugOverlay.style.display = v ? '' : 'none'
  controls.enabled = v
  mouseBallDebugMesh.visible = v
  gui.domElement.style.display = v ? '' : 'none'
}

setDebug(params.debug)
gui.add(params, 'debug').name('Debug (P)').onChange(setDebug)

const envFolder = gui.addFolder('Environment')
envFolder
  .addColor(params, 'background')
  .name('Background')
  .onChange((v) => {
    scene.background = new THREE.Color(v)
  })
envFolder
  .add(params, 'ambientIntensity', 0, 5)
  .name('Ambient')
  .onChange((v) => (ambientLight.intensity = v))
envFolder
  .add(params, 'spotIntensity', 0, 1000)
  .name('Spot')
  .onChange((v) => (spotLight.intensity = v))
const toneMappingOptions = {
  None: THREE.NoToneMapping,
  Linear: THREE.LinearToneMapping,
  Reinhard: THREE.ReinhardToneMapping,
  Cineon: THREE.CineonToneMapping,
  ACESFilmic: THREE.ACESFilmicToneMapping,
  AgX: THREE.AgXToneMapping,
  Neutral: THREE.NeutralToneMapping,
}
envFolder
  .add(params, 'toneMapping', Object.keys(toneMappingOptions))
  .name('Tone Mapping')
  .onChange((v) => {
    renderer.toneMapping = toneMappingOptions[v]
  })

const matFolder = gui.addFolder('Material')
matFolder
  .addColor(params, 'color')
  .name('Color')
  .onChange((v) => (glassMaterial.color = v))
matFolder
  .add(params, 'transmission', 0, 1)
  .name('Transmission')
  .onChange((v) => (glassMaterial.transmission = v))
matFolder
  .add(params, 'thickness', 0, 5)
  .name('Thickness')
  .onChange((v) => (glassMaterial.thickness = v))
matFolder
  .add(params, 'roughness', 0, 1)
  .name('Roughness')
  .onChange((v) => (glassMaterial.roughness = v))
matFolder
  .add(params, 'ior', 1, 2.33)
  .name('IOR')
  .onChange((v) => (glassMaterial.ior = v))
matFolder
  .add(params, 'dispersion', 0, 40)
  .name('Dispersion')
  .onChange((v) => (glassMaterial.dispersion = v))
matFolder
  .add(params, 'frostBlur', 0, 1)
  .name('Frost Blur')
  .onChange((v) => (glassMaterial.frostBlur = v))
matFolder
  .add(params, 'frostNoiseAmplitude', 0, 3)
  .name('Frost Noise Amp')
  .onChange((v) => (glassMaterial.frostNoiseAmplitude = v))
matFolder
  .add(params, 'frostNoiseFrequency', 0.01, 0.3, 0.01)
  .name('Frost Noise Freq')
  .onChange((v) => (glassMaterial.frostNoiseFrequency = v))
matFolder
  .addColor(params, 'attenuationColor')
  .name('Atten. Color')
  .onChange((v) => (glassMaterial.attenuationColor = v))
matFolder
  .add(params, 'attenuationDistance', 0, 10)
  .name('Atten. Dist')
  .onChange((v) => (glassMaterial.attenuationDistance = v))
matFolder
  .add(params, 'envMapIntensity', 0, 3)
  .name('EnvMap Int.')
  .onChange((v) => (glassMaterial.envMapIntensity = v))
matFolder
  .add(params, 'iridescence', 0, 8)
  .name('Iridescence')
  .onChange((v) => (glassMaterial.iridescence = v))
matFolder
  .add(params, 'iridescenceIOR', 1, 2.33)
  .name('Irid. IOR')
  .onChange((v) => (glassMaterial.iridescenceIOR = v))
matFolder
  .add(params, 'iridescenceThicknessMin', 0, 800)
  .name('Irid. Min')
  .onChange((v) => (glassMaterial.iridescenceThicknessRange = [v, params.iridescenceThicknessMax]))
matFolder
  .add(params, 'iridescenceThicknessMax', 0, 800)
  .name('Irid. Max')
  .onChange((v) => (glassMaterial.iridescenceThicknessRange = [params.iridescenceThicknessMin, v]))
matFolder
  .add(params, 'clearcoat', 0, 1)
  .name('Clearcoat')
  .onChange((v) => (glassMaterial.clearcoat = v))
matFolder
  .add(params, 'clearcoatRoughness', 0, 1)
  .name('CC Roughness')
  .onChange((v) => (glassMaterial.clearcoatRoughness = v))
matFolder
  .add(params, 'specularIntensity', 0, 2)
  .name('Specular Int.')
  .onChange((v) => (glassMaterial.specularIntensity = v))
matFolder
  .addColor(params, 'specularColor')
  .name('Specular Color')
  .onChange((v) => (glassMaterial.specularColor = v))

const physicsFolder = gui.addFolder('Physics')
physicsFolder.add(params, 'wanderStrength', 0, 3, 0.01).name('Wander Strength')
physicsFolder.add(params, 'wanderSpeed', 0, 2, 0.01).name('Wander Speed')
physicsFolder.add(params, 'attractionStrength', 0, 30, 0.01).name('Attraction')
physicsFolder
  .add(params, 'mouseBallRadius', 0.1, 4, 0.01)
  .name('Mouse Force Radius')
  .onChange((v) => {
    mouseBallDebugMesh.geometry.dispose()
    mouseBallDebugMesh.geometry = new THREE.SphereGeometry(v, 16, 16)
  })
physicsFolder
  .add(params, 'linearDamping', 0, 10)
  .name('Linear Damping')
  .onChange((v) => {
    for (const { rigidBody } of cubeBodies) rigidBody.setLinearDamping(v)
  })
physicsFolder
  .add(params, 'angularDamping', 0, 10)
  .name('Angular Damping')
  .onChange((v) => {
    for (const { rigidBody } of cubeBodies) rigidBody.setAngularDamping(v)
  })
physicsFolder
  .add(params, 'restitution', 0, 1)
  .name('Restitution')
  .onChange((v) => {
    for (const { rigidBody } of cubeBodies) {
      for (let i = 0; i < rigidBody.numColliders(); i++) {
        rigidBody.collider(i).setRestitution(v)
      }
    }
  })
physicsFolder
  .add(params, 'friction', 0, 2)
  .name('Friction')
  .onChange((v) => {
    for (const { rigidBody } of cubeBodies) {
      for (let i = 0; i < rigidBody.numColliders(); i++) {
        rigidBody.collider(i).setFriction(v)
      }
    }
  })
physicsFolder.add(params, 'waterDrag').name('Water Drag')
physicsFolder.add(params, 'waterDragCoefficient', 0, 5, 0.01).name('Drag Coefficient')

window.addEventListener('keydown', (e) => {
  if (e.key === 'c' || e.key === 'C') {
    const hidden = gui.domElement.style.display === 'none'
    gui.domElement.style.display = hidden ? '' : 'none'
  }
  if (e.key === 'p' || e.key === 'P') {
    params.debug = !params.debug
    setDebug(params.debug)
    gui
      .controllersRecursive()
      .find((c) => c.property === 'debug')
      .updateDisplay()
  }
})

// ─── Resize ──────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  textCanvas.width = window.innerWidth * textDpr
  textCanvas.height = window.innerHeight * textDpr
  updateTextPlane()
  // Recreate texture — WebGPU GPUTexture has fixed dimensions, so needsUpdate alone
  // won't handle a canvas resize. We must dispose and create a new CanvasTexture.
  textTexture.dispose()
  textTexture = new THREE.CanvasTexture(textCanvas)
  textTexture.colorSpace = THREE.SRGBColorSpace
  textPlane.material.map = textTexture
  textPlane.geometry.dispose()
  const newAspect = window.innerWidth / window.innerHeight
  textPlane.geometry = new THREE.PlaneGeometry(textPlaneHeight * newAspect, textPlaneHeight)
  // Recreate wall colliders for new viewport size
  for (const body of wallBodies) world.removeRigidBody(body)
  wallBodies = createWalls()
})

// ─── Animation loop ──────────────────────────────────────────────────────────

const _attractDir = new THREE.Vector3()
const _wanderDir = new THREE.Vector3()
const physicsTimestep = new FixedTimestep()

signalReady()
renderer.setAnimationLoop(async (timestamp) => {
  if (!sceneActive) return
  // Raycast for mouse world position
  if (mouseActive) {
    raycaster.setFromCamera(mouseNDC, camera)
    const intersects = raycaster.intersectObject(raycastPlane)
    if (intersects.length > 0) {
      mouseWorldPos.copy(intersects[0].point)
    }
    mouseBallDebugMesh.position.copy(mouseWorldPos)
  } else {
    mouseBallDebugMesh.position.set(100, 100, 100)
  }

  // Fixed-timestep physics
  const steps = physicsTimestep.update(timestamp)
  const dt = physicsTimestep.dt
  for (let i = 0; i < steps; i++) {
    try {
      const t = timestamp * 0.001
      for (let j = 0; j < cubeBodies.length; j++) {
        const { rigidBody } = cubeBodies[j]
        const pos = rigidBody.translation()
        const seed = wanderSeeds[j]

        // Attraction toward center
        _attractDir
          .set(-pos.x, -pos.y, -pos.z)
          .normalize()
          .multiplyScalar(params.attractionStrength * dt)

        // Slow per-body wander force
        const s = params.wanderSpeed
        _wanderDir.set(
          Math.sin(t * s + seed.ox) + Math.sin(t * s * 0.57 + seed.ox * 2),
          Math.sin(t * s * 0.77 + seed.oy) + Math.sin(t * s * 0.43 + seed.oy * 2),
          Math.sin(t * s * 0.63 + seed.oz) + Math.sin(t * s * 0.37 + seed.oz * 2),
        )
        _wanderDir.normalize().multiplyScalar(params.wanderStrength * dt)
        _attractDir.add(_wanderDir)

        // Water drag — quadratic resistance opposing velocity
        if (params.waterDrag) {
          const vel = rigidBody.linvel()
          const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z)
          if (speed > 0.001) {
            const dragForce = params.waterDragCoefficient * speed * speed * dt
            const invSpeed = 1 / speed
            _attractDir.x -= vel.x * invSpeed * dragForce
            _attractDir.y -= vel.y * invSpeed * dragForce
            _attractDir.z -= vel.z * invSpeed * dragForce
          }
        }

        // Mouse repulsion force — smooth falloff within radius
        if (mouseActive) {
          const dx = pos.x - mouseWorldPos.x
          const dy = pos.y - mouseWorldPos.y
          const dz = pos.z - mouseWorldPos.z
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (dist < params.mouseBallRadius && dist > 0.001) {
            const falloff = 1 - dist / params.mouseBallRadius
            const strength = falloff * falloff * 500 * dt
            const invDist = 1 / dist
            _attractDir.x += dx * invDist * strength
            _attractDir.y += dy * invDist * strength
            _attractDir.z += dz * invDist * strength
          }
        }

        rigidBody.applyImpulse(_attractDir, true)
      }
      world.step()
    } catch {}
  }

  // Sync Three.js meshes with physics bodies
  for (let j = 0; j < cubeBodies.length; j++) {
    const { mesh, rigidBody } = cubeBodies[j]
    try {
      const pos = rigidBody.translation()
      const rot = rigidBody.rotation()
      mesh.position.set(pos.x, pos.y, pos.z)
      mesh.quaternion.set(rot.x, rot.y, rot.z, rot.w)
    } catch {}
  }

  // ── OIT: sort letter groups back-to-front by camera distance ──
  // Each letter has a back mesh (renderOrder base) and front mesh (renderOrder base+1).
  // We sort letters so farther letters render first, giving correct alpha compositing
  // when letters overlap from the current view angle.
  const camPos = camera.position
  const _sortDir = new THREE.Vector3()
  const distances = cubeBodies.map(({ mesh }, i) => {
    _sortDir.copy(mesh.position).sub(camPos)
    return { index: i, dist: _sortDir.lengthSq() }
  })
  distances.sort((a, b) => b.dist - a.dist) // back-to-front

  for (let rank = 0; rank < distances.length; rank++) {
    const { index } = distances[rank]
    const group = cubeBodies[index].mesh
    // Back face gets even renderOrder, front face gets odd (next)
    const baseOrder = rank * 2 + 1
    group.children[0].renderOrder = baseOrder     // back face
    group.children[1].renderOrder = baseOrder + 1  // front face
  }

  renderer.render(scene, camera)

  if (stats) {
    stats.update()
    await renderer.resolveTimestampsAsync('render')
    await renderer.resolveTimestampsAsync('compute')
  }
})
