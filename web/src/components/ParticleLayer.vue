<template>
  <div ref="containerRef" class="particle-layer"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'

const containerRef = ref<HTMLDivElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let points: THREE.Points | null = null
let animationId = 0
let resize: (() => void) | null = null

onMounted(() => {
  const el = containerRef.value!

  // 1. Renderer：WebGL 画布（透明背景，叠在 Cesium 上）
  //    ★容器尺寸还没算出来时 clientWidth/clientHeight 是 0，
  //      setSize(0,0) 会得到一个 0×0 的画布（而且 aspect 会变成 NaN）。
  //      这里给个兜底，随后由 resize() 校正成真实尺寸。
  const initW = el.clientWidth || window.innerWidth
  const initH = el.clientHeight || window.innerHeight
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setSize(initW, initH)
  renderer.setPixelRatio(window.devicePixelRatio)
  el.appendChild(renderer.domElement)

  // 2. Scene + Camera
  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(60, initW / initH, 0.1, 1000)
  camera.position.z = 100

  // 3. 生成 2000 个粒子（位置存 Float32Array）
  const count = 2000
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count * 3; i++) {
    positions[i] = (Math.random() - 0.5) * 200
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

  const material = new THREE.PointsMaterial({
    color: 0x5b8ff9,
    size: 0.6,
    transparent: true,
    opacity: 0.2,  // 别盖住建筑，半透明点缀
  })

  points = new THREE.Points(geometry, material)
  scene.add(points)

  // 4. 动画循环：粒子向上飘 + 整体旋转
  const animate = () => {
    animationId = requestAnimationFrame(animate)
    if (points) {
      points.rotation.y += 0.001
      const pos = points.geometry.attributes.position.array as Float32Array
      for (let i = 1; i < pos.length; i += 3) {
        pos[i] += 0.2 // y 坐标 +0.2（向上飘）
        if (pos[i] > 50) pos[i] = -50 // 飘出顶部后从底部重来
      }
      points.geometry.attributes.position.needsUpdate = true
    }
    renderer!.render(scene!, camera!)
  }
  animate()

  // 5. ★跟着窗口改尺寸
  //   没有这段：窗口一缩放，Three.js 画布的像素尺寸还停在初始值，
  //   而 CSS 里的 100% 已经变了 → 画面被拉变形 / 粒子错位
  resize = () => {
    if (!renderer || !camera || !containerRef.value) return
    const w = containerRef.value.clientWidth
    const h = containerRef.value.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }
  window.addEventListener('resize', resize)
  resize() // 立刻按真实容器尺寸校正一次
})

onUnmounted(() => {
  cancelAnimationFrame(animationId)
  if (resize) window.removeEventListener('resize', resize)
  points?.geometry.dispose()
  ;(points?.material as THREE.Material)?.dispose()
  renderer?.dispose()
  // ★必须把 canvas 从 DOM 上摘掉。
  //   只调 dispose() 释放的是 WebGL 资源，<canvas> 节点还留在页面里；
  //   热更新反复挂载会不断累积，最后撞到浏览器的 WebGL 上下文数量上限，
  //   表现就是"改几次代码粒子层突然全黑"。
  if (renderer?.domElement.parentNode) {
    renderer.domElement.parentNode.removeChild(renderer.domElement)
  }
  renderer = null
  scene = null
  camera = null
  points = null
})
</script>

<style scoped>
.particle-layer {
  position: absolute;
  inset: 0;
  pointer-events: none; /* ★关键：不挡 Cesium 的鼠标拖动/点击 */
  z-index: 10;
}
</style>
