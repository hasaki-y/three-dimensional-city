<template>
  <div ref="containerRef" class="city-scene"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as Cesium from 'cesium'
import { SCENE_CONFIG } from '../config'
import { useStore, type BuildingProps } from '../store'
import { api } from '../api'

const containerRef = ref<HTMLDivElement | null>(null)
const store = useStore()
let viewer: Cesium.Viewer | null = null
let analysisRequestId = 0

const buildingMap = new Map<string, BuildingProps>()

// 建筑实际外包框（loadBuildings 时累计出来）。2D 取景要用它，
// 因为 2D 是正俯视、可见范围完全由相机高度决定，写死一个高度在不同
// 窗口比例下会把城区切掉一半。
let cityBounds: { west: number; south: number; east: number; north: number } | null = null

// 当前是不是 2D 平面视角
function is2D() {
  return viewer?.scene.mode === Cesium.SceneMode.SCENE2D
}

// ================== 按视角切换建筑的显示方式 ==================
// 3D：box（立方体，能看出高度差）
// 2D：point（正俯视看不出高度，box 投影下来就是 30m 的小方块，
//          缩放后只有几个像素、连成一片分不清，改成固定像素的圆点更清楚）
function applyBuildingGraphics(mode: Cesium.SceneMode) {
  if (!viewer) return
  const flat = mode === Cesium.SceneMode.SCENE2D
  for (const entity of viewer.entities.values) {
    // ★只动建筑实体。分析图层的圆点（analysis-point / nearest-point-*）
    //   也只有 point 没有 box，不拦住的话会在 3D 下被一起 show=false 关掉。
    if (!buildingMap.has(entity.id)) continue
    if (entity.box) entity.box.show = !flat as any
    if (entity.point) entity.point.show = flat as any
  }
}

// ================== 核心数据加载函数（只保留这一个，包含筛选） ==================
async function loadBuildings() {
  if (!viewer) return

  // ★先清空旧实体，否则筛选后建筑会叠加
  //   注意：removeAll 连分析图层（缓冲圆 / KNN 连线）一起清掉了，
  //   所以同步把分析结果也置空，否则面板会显示"图上已经没有的结果"
  viewer.entities.removeAll()
  buildingMap.clear()
  cityBounds = null
  store.bufferResult = null
  store.nearestResults = []
  store.selectBuilding(null)

  // 组装筛选参数（空的不传，后端默认返回全部）
  const params: Record<string, string | number> = {}
  if (store.filter.type) params.type = store.filter.type
  if (store.filter.minFloors) params.minFloors = store.filter.minFloors

  // ★坑：这里是 await，接口失败会抛异常。
  //   如果不管，异常会一路冒到 onMounted —— 后面注册点击事件的代码就永远不执行，
  //   表现为"后端没起来时，地图能拖能缩放，但点建筑完全没反应"。
  let buildings: BuildingProps[]
  try {
    buildings = (await api.buildings(params)).buildings
  } catch (e) {
    console.error('[CityScene] 建筑数据加载失败，请确认后端 3001 已启动：', e)
    return
  }

  const bounds = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity }
  const flat = is2D()

  buildings.forEach((b: BuildingProps) => {
    const color = Cesium.Color.fromCssColorString(
      SCENE_CONFIG.BUILDING_COLORS[b.type] || '#888888'
    )
    // ★坑：Cesium 的 BoxGeometry 以 position 为中心（corner = dimensions * 0.5）。
    //   原来写 height:0 → 盒子中心贴在地表，一半埋在地球里被地表挡住，
    //   楼看起来只有一半高。楼要"坐"在地上，中心必须在半高：height / 2。
    const entity = viewer!.entities.add({
      position: Cesium.Cartesian3.fromDegrees(b.lon, b.lat, b.height / 2),
      // 3D 用立方体
      box: {
        dimensions: new Cesium.Cartesian3(30, 30, b.height),
        material: color.withAlpha(1.0),  // 纯色不透明，更醒目
        outline: true,
        outlineColor: Cesium.Color.WHITE.withAlpha(0.3),
        show: !flat,
      },
      // 2D 用圆点（同一个 entity 挂两份图形，切换时改 show 就行，
      // 不用重建 3489 个实体，buildingMap 也不会失效）
      point: {
        pixelSize: 7,
        color: color.withAlpha(1.0),
        outlineColor: Cesium.Color.WHITE.withAlpha(0.3),
        outlineWidth: 1,
        show: flat,
      },
    })
    buildingMap.set(entity.id, b)

    if (b.lon < bounds.west) bounds.west = b.lon
    if (b.lon > bounds.east) bounds.east = b.lon
    if (b.lat < bounds.south) bounds.south = b.lat
    if (b.lat > bounds.north) bounds.north = b.lat
  })

  // 筛选后一栋楼都没有时保持 null，flyToCity 会退回默认取景
  cityBounds = Number.isFinite(bounds.west) ? bounds : null
}

// ================== 监听筛选条件变化（放在外层） ==================
watch(
  () => [store.filter.type, store.filter.minFloors],
  async () => {
    await loadBuildings()
  }
)

// ================== 监听二三维切换 ==================
watch(
  () => store.viewMode,
  (mode) => {
    if (!viewer) return
    if (mode === '2d') {
      viewer.scene.morphTo2D(0.5)
    } else {
      viewer.scene.morphTo3D(0.5)
    }
    // morph 动画真正结束时 Cesium 会发 morphComplete，那时才摆相机（见下）。
    // 这里先试一次，覆盖"本来就已经是目标模式、不会触发 morph"的情况。
    flyToCity()
  }
)

// 退出分析时清除地图标记和结果；请求未完成时使旧响应失效。
watch(
  () => store.analysisMode,
  (mode) => {
    analysisRequestId++
    if (mode !== 'none') return
    clearAnalysis()
    store.bufferResult = null
    store.nearestResults = []
  }
)

// ================== 初始化 ==================
onMounted(async () => {
  viewer = new Cesium.Viewer(containerRef.value!, {
    baseLayer: false,
    timeline: false,
    animation: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
  })

  viewer.scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a1428')

  // ★不加限制时相机能一路钻到地底下，画面直接穿模。
  viewer.scene.screenSpaceCameraController.minimumZoomDistance = 60

  // ★ 先注册点击事件，再去 await 拉数据。
  viewer.screenSpaceEventHandler.setInputAction(onLeftClick, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  // ★★★ 补上这句否则初始地图是空的 ★★★
  await loadBuildings()

  // ★ morph 动画结束后再切建筑图形 + 把相机摆回城市中心。
  //   必须用这个事件，不能用 setTimeout 猜时间（原因见 flyToCity 上面的注释）。
  viewer.scene.morphComplete.addEventListener(onViewModeSettled)

  // ★ 建筑加载完后，重新 setView 到城市中心（确保相机对准建筑）
  flyToCity()
})

// ================== 视角切换收尾 ==================
function onViewModeSettled() {
  if (!viewer || viewer.isDestroyed()) return
  applyBuildingGraphics(viewer.scene.mode)
  flyToCity()
}

// 把相机摆到城市中心。
// ★"切视角后要素全丢只剩黑屏"的真正原因（已查 Cesium 源码 + 实测确认）：
//   1) Camera.setView 第一句就是
//          if (this._mode === SceneMode.MORPHING) return;
//      ——【变形动画期间调用 setView 会被静默丢弃】，不报错、不生效。
//   2) 而且两个方向的时机还不一样，调用完 morph 立刻读 scene.mode 判断"好没好"
//      同样不可靠：
//        · morphTo2D() 会同步把 scene.mode 置成 MORPHING；
//        · morphTo3D() 第一段是 camera.flyTo，同步返回时 scene.mode 仍是 SCENE2D
//          （源码 morphFrom2DTo3D 里就写着 scene._mode = SceneMode.SCENE2D）。
//   3) 两个方向的动画终点都是
//          (0°, 0°) 上空 5 × 地球半径 ≈ 31890 km —— 整个地球的俯视图。
//      本项目 baseLayer:false 没有影像，地表只有 globe.baseColor(#0a1428 近乎黑色)，
//      所以动画一结束就是满屏黑，杭州的建筑缩到 0.2 个像素：
//      切 2D 表现为"建筑全没了"，切回 3D 表现为"只剩一个地球"。
//   原代码 setTimeout(600) 是在赌动画已经结束，机器一慢就赌输。
//   现在改成：只由 morphComplete 事件触发，落地后再校验一次。
let placeTries = 0

function cameraIsOnCity() {
  if (!viewer) return false
  const c = viewer.camera.positionCartographic
  const lon = Cesium.Math.toDegrees(c.longitude)
  const lat = Cesium.Math.toDegrees(c.latitude)
  // 动画终点是 (0°,0°) 上空 31890km，用高度/经纬度就能一眼识别出来
  return (
    c.height < 1e6 &&
    Math.abs(lon - SCENE_CONFIG.center.lon) < 0.1 &&
    Math.abs(lat - SCENE_CONFIG.center.lat) < 0.1
  )
}

function setCameraToCity() {
  if (!viewer) return

  if (is2D()) {
    // ============ 2D 平面 ============
    // Cesium 在 2D 下不接受倾斜：setView2D 内部会把 pitch 强制成 -90°，
    // 所以这里给的 -90° 就是"正俯视"，和 3D 的 -45° 明确区分开。
    // 取景用 Rectangle 而不是写死高度：2D 的可见宽度 = 相机高度，
    // 可见高度还要再乘画布宽高比，写死米数在不同窗口比例下会切掉城区；
    // 传 Rectangle 时 Cesium 会自己算出装得下它的相机高度和中心位置
    // （见 Camera.getRectangleCameraCoordinates → rectangleCameraPosition2D）。
    const b = cityBounds
    let west = SCENE_CONFIG.center.lon - SCENE_CONFIG.camera2DFallbackHalfLon
    let east = SCENE_CONFIG.center.lon + SCENE_CONFIG.camera2DFallbackHalfLon
    let south = SCENE_CONFIG.center.lat - SCENE_CONFIG.camera2DFallbackHalfLat
    let north = SCENE_CONFIG.center.lat + SCENE_CONFIG.camera2DFallbackHalfLat
    if (b) {
      // 四周各留 8% 余量，别让最外圈的楼贴着屏幕边
      const padLon = (b.east - b.west) * 0.08 + 0.0005
      const padLat = (b.north - b.south) * 0.08 + 0.0005
      west = b.west - padLon
      east = b.east + padLon
      south = b.south - padLat
      north = b.north + padLat
    }
    viewer.camera.setView({
      destination: Cesium.Rectangle.fromDegrees(west, south, east, north),
      orientation: {
        heading: 0,
        pitch: Cesium.Math.toRadians(-90),   // 正俯视
        roll: 0,
      },
    })
    return
  }

  // ============ 3D 三维（取景保持原样，不动）============
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(
      SCENE_CONFIG.center.lon,
      SCENE_CONFIG.center.lat,
      SCENE_CONFIG.camera3DHeight
    ),
    orientation: {
      heading: Cesium.Math.toRadians(0),                          // 朝北
      pitch: Cesium.Math.toRadians(SCENE_CONFIG.camera3DPitch),    // 45° 俯角
      roll: 0,
    },
  })
}

// ★ 飞到城市中心（2D/3D 切换后由 morphComplete 事件调用）
function flyToCity() {
  if (!viewer || viewer.isDestroyed()) return

  // 变形动画中 setView 会被静默丢弃 → 直接返回，等 morphComplete 事件再来
  if (viewer.scene.mode === Cesium.SceneMode.MORPHING) return

  setCameraToCity()

  // ★落地校验：万一 setView 还是落了空（或被还在跑的动画覆盖），下一帧重摆。
  //   校验的是"相机到底有没有到城市中心"，而不是"我以为它到了"。
  if (!cameraIsOnCity() && placeTries++ < 300) {
    requestAnimationFrame(flyToCity)
  } else {
    placeTries = 0
  }
}

// ================== 鼠标点击处理 ==================
async function onLeftClick(movement: Cesium.ScreenSpaceEventHandler.PositionedEvent) {
  if (!viewer) return

  // 情况 A：正在分析模式 → 点地图取经纬度，触发分析
  if (store.analysisMode !== 'none') {
    // ★屏幕像素坐标 → 地球经纬度（关键 API）
    const cartesian = viewer.camera.pickEllipsoid(
      movement.position,
      viewer.scene.globe.ellipsoid
    )
    if (!cartesian) return
    const carto = Cesium.Cartographic.fromCartesian(cartesian)
    const lon = Cesium.Math.toDegrees(carto.longitude)
    const lat = Cesium.Math.toDegrees(carto.latitude)

    if (store.analysisMode === 'buffer') await runBuffer(lon, lat)
    else await runNearest(lon, lat)
    return
  }

  // 情况 B：正常模式 → 选建筑
  const picked = viewer.scene.pick(movement.position)
  if (picked && picked.id) {
    const b = buildingMap.get(picked.id.id)
    store.selectBuilding(b || null)
  } else {
    store.selectBuilding(null)
  }
}
// 清掉旧分析图层
function clearAnalysis() {
  if (!viewer) return
  viewer.entities.removeById('analysis-point')
  viewer.entities.removeById('analysis-circle')

  // 统一清理所有 KNN 图层（线 + 终点标注）
  const toRemove: string[] = []
  for (const entity of viewer.entities.values) {
    if (
      typeof entity.id === 'string' &&
      (entity.id.startsWith('nearest-line-') ||
       entity.id.startsWith('nearest-point-'))
    ) {
      toRemove.push(entity.id)
    }
  }
  toRemove.forEach((id) => viewer!.entities.removeById(id))
}


async function runBuffer(lon: number, lat: number) {
  if (!viewer) return
  const requestId = ++analysisRequestId
  clearAnalysis()

  // 画中心点
  viewer.entities.add({
    id: 'analysis-point',
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    point: { pixelSize: 10, color: Cesium.Color.YELLOW },
  })

  // 调后端 /api/buffer（radius 单位 km，0.3 = 300m）
  let result
  try {
    result = await api.buffer(lon, lat, 0.3)
  } catch (e) {
    console.error('[CityScene] 缓冲区分析失败：', e)
    return
  }
  if (requestId !== analysisRequestId || store.analysisMode !== 'buffer' || !viewer || viewer.isDestroyed()) return
  store.bufferResult = result

  // 画缓冲区圆（ellipse，单位米）
  viewer.entities.add({
    id: 'analysis-circle',
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    ellipse: {
      semiMajorAxis: result.radiusKm * 1000,
      semiMinorAxis: result.radiusKm * 1000,
      material: Cesium.Color.RED.withAlpha(0.2),
      outline: true,
      outlineColor: Cesium.Color.RED,
    },
  })
}

async function runNearest(lon: number, lat: number) {
  if (!viewer) return
  const requestId = ++analysisRequestId
  clearAnalysis()

  viewer.entities.add({
    id: 'analysis-point',
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    point: { pixelSize: 10, color: Cesium.Color.YELLOW },
  })

  let result
  try {
    result = await api.nearest(lon, lat, '医院', 5)
  } catch (e) {
    console.error('[CityScene] 最近邻查询失败：', e)
    return
  }
  if (requestId !== analysisRequestId || store.analysisMode !== 'nearest' || !viewer || viewer.isDestroyed()) return
  store.nearestResults = result.results

  result.results.forEach((r: any, i: number) => {
    // 线：从我的位置到医院
    viewer!.entities.add({
      id: `nearest-line-${i}`,
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray([lon, lat, r.lon, r.lat]),
        width: 2,
        material: Cesium.Color.CYAN,
      },
    })

    // 医院点 + 标注：单独一个 entity，位置在医院
    viewer!.entities.add({
      id: `nearest-point-${i}`,
      position: Cesium.Cartesian3.fromDegrees(r.lon, r.lat),
      point: { pixelSize: 12, color: Cesium.Color.CYAN },
      label: {
        text: r.name,
        font: '12px sans-serif',
        fillColor: Cesium.Color.WHITE,
        pixelOffset: new Cesium.Cartesian2(12, 0),
      },
    })
  })
}

// ================== 销毁 ==================
onUnmounted(() => {
  if (viewer && !viewer.isDestroyed()) {
    // ★先摘掉 morphComplete 监听：热更新会反复挂载，
    //   直接把旧的 viewer 销毁而监听还挂在事件上，回调会拿着已销毁的 viewer 继续跑。
    viewer.scene.morphComplete.removeEventListener(onViewModeSettled)
    viewer.destroy()
  }
})
</script>

<style scoped>
.city-scene {
  position: absolute;
  inset: 0;
}
</style>
