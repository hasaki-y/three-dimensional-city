// Turf.js：地理空间计算库（只装我们用的四个小包）
// 注意：turf 7.x 必须解构命名导出，不能直接 require 当函数用
const { buffer } = require('@turf/buffer')
const { pointsWithinPolygon } = require('@turf/points-within-polygon')
const { nearestPoint } = require('@turf/nearest-point')
const { distance } = require('@turf/distance')


// 空间分析工具模块：负责"加载数据 + 地理计算"，路由层只负责接请求
const fs = require('fs')
const path = require('path')

const DATA_DIR = path.join(__dirname, '..', 'data')

// 读取 GeoJSON 文件并解析成 JS 对象
function loadGeoJSON(name) {
  const raw = fs.readFileSync(path.join(DATA_DIR, name), 'utf-8')
  return JSON.parse(raw)
}

// 服务启动时把全部数据一次性加载进内存
// 原因：数据是静态的（生成后不变），没必要每次请求都重新读磁盘
const data = {
  buildings: loadGeoJSON('buildings.geojson'),
  pois:       loadGeoJSON('pois.geojson'),
  roads:      loadGeoJSON('roads.geojson'),
  districts:  loadGeoJSON('districts.geojson'),
  water:      loadGeoJSON('water.geojson'),
  parks:      loadGeoJSON('parks.geojson'),
}

// ===== 聚合统计 =====
// 把一组要素按"某个属性"分组，统计每组的数量、平均高度、平均面积
function groupBy(features, getKey) {
  const groups = {}
  for (const f of features) {
    const p = f.properties
    const key = getKey(p)                      // 用回调函数取出"分组依据"
    if (!groups[key]) {
      groups[key] = { count: 0, totalHeight: 0, totalArea: 0 }
    }
    groups[key].count++
    groups[key].totalHeight += p.height || 0
    groups[key].totalArea += p.area || 0
  }
  return Object.entries(groups)
    .map(([name, g]) => ({
      name,
      count: g.count,
      avgHeight: Math.round(g.totalHeight / g.count),  // 平均高度
      avgArea:   Math.round(g.totalArea / g.count),    // 平均面积
    }))
    .sort((a, b) => b.count - a.count)  // 数量多的排前面
}

// 连续值 → 离散"段"：分组的前提
// 建筑高度是连续值（12m / 45.3m / 78m...），不分成段就没法分组统计
function heightBand(h) {
  if (h < 15)  return '低层 (<15m)'
  if (h < 30)  return '多层 (15-30m)'
  if (h < 60)  return '高层 (30-60m)'
  return '超高层 (>60m)'
}

// 面积同样分三段
function areaBand(a) {
  if (a < 1200) return '小面积 (<1200㎡)'
  if (a < 2400) return '中面积 (1200-2400㎡)'
  return '大面积 (>2400㎡)'
}
// ===== 建筑筛选 =====
// 组合条件过滤（类似 SQL 的 WHERE）：条件全部可选，满足所有条件的才保留
function filterBuildings(cond) {
  return data.buildings.features
    .filter(f => {
      const p = f.properties
      if (cond.type     && p.type !== cond.type)     return false  // 类型不匹配 → 剔除
      if (cond.district && p.district !== cond.district) return false
      if (cond.minFloors != null && p.floors < cond.minFloors) return false
      if (cond.maxFloors != null && p.floors > cond.maxFloors) return false
      if (cond.minYear   != null && p.year < cond.minYear)     return false
      if (cond.maxYear   != null && p.year > cond.maxYear)     return false
      return true  // 所有条件都通过 → 保留
    })
    .map(f => f.properties)  // 只返回属性（含 lon/lat），前端直接定位渲染
}
// ===== 缓冲区分析（PostGIS 版对应 ST_Buffer + ST_Within） =====
// 以 (lon, lat) 为圆心、radiusKm 公里为半径画圆，圈出圆内所有建筑
function bufferAnalysis(lon, lat, radiusKm) {
  // 1) 建筑转成 Turf 需要的"点集合"（Turf 只认标准 GeoJSON）
  const buildingPoints = {
    type: 'FeatureCollection',
    features: data.buildings.features.map(f => ({
      type: 'Feature',
      properties: { ...f.properties },
      geometry: { type: 'Point', coordinates: [f.properties.lon, f.properties.lat] },
    })),
  }
  // 2) 圆心 + 半径 → 生成缓冲圆（一个 Polygon）
  const center = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [lon, lat] },
  }
  const circle = buffer(center, radiusKm, { units: 'kilometers' })

  // radiusKm 非法（<=0 / NaN）时 buffer 会返回 undefined 或空几何，
  // 直接往下走 pointsWithinPolygon 会读 .type 抛 TypeError。
  // 路由层已经拦了，这里再加一道，保证模块单独用也不会炸。
  if (!circle || !circle.geometry) {
    return {
      center: { lon, lat }, radiusKm,
      count: 0, avgHeight: 0, avgArea: 0,
      ids: [], circle: null, buildings: [],
    }
  }

  // 3) 点面包含：哪些建筑落在圆内
  const inside = pointsWithinPolygon(buildingPoints, circle)

  // 4) 汇总统计：命中数量 + 平均高度/面积
  const props = inside.features.map(f => f.properties)
  const avg = (arr) => (arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0)
  return {
    center: { lon, lat },
    radiusKm,
    count: props.length,
    avgHeight: avg(props.map(p => p.height)),
    avgArea:   avg(props.map(p => p.area)),
    ids: props.map(p => p.id),      // 命中的建筑 id 列表
    circle: circle.geometry,        // 圆本身也返回，前端直接画在地图上
    buildings: props,               // 命中建筑明细
  }
}
// ===== KNN 最近邻查询（PostGIS 对应 <-> 距离算子 + GIST 索引） =====
// 找离 (lon, lat) 最近的 N 个指定类型 POI（如最近的 5 家医院）
function nearestPois(lon, lat, poiType, limit) {
  // 1) 先过滤出指定类型的 POI，转成 Turf 点集合
  const candidates = data.pois.features.filter(f => f.properties.type === poiType)
  if (!candidates.length) return { count: 0, results: [] }

  const points = {
    type: 'FeatureCollection',
    features: candidates.map(f => ({
      type: 'Feature',
      properties: { ...f.properties },
      geometry: { type: 'Point', coordinates: [f.properties.lon, f.properties.lat] },
    })),
  }

  // 2) 查询者（目标点）
  const target = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [lon, lat] },
  }

  // 3) 逐个找最近：nearestPoint 找最近的 1 个 → 记下 → 从候选里删掉 → 再找下一个
  //    ★坑：nearestPoint 返回的是"新对象"不是原数组里的引用，
  //    用 indexOf(nearest) 删除会失败（引用对不上，同一个点会被反复选中 5 次）
  //    正确做法：用 id 定位删除
  const results = []
  let rest = points.features.slice()   // 复制一份，不污染原始数据
  for (let i = 0; i < limit && rest.length; i++) {
    const nearest = nearestPoint(target, { type: 'FeatureCollection', features: rest })
    // Turf 在空集合上会返回 undefined，直接读 .properties 会抛异常
    if (!nearest || !nearest.properties) break
    const id = nearest.properties.id
    // 在原始候选里找完整属性（Turf 返回的点可能只带部分属性）
    const found = candidates.find(c => c.properties.id === id)
    if (found) {
      results.push({
        ...found.properties,
        distanceKm: Math.round(distance(target, nearest, { units: 'kilometers' }) * 1000) / 1000,
      })
    }
    // 用 id 过滤删除（不能 rest.splice(rest.indexOf(nearest), 1)——删不掉）
    rest = rest.filter(f => f.properties.id !== id)
  }
  return { count: results.length, results }
}

// 导出给 index.js 用
// ★坑：上面所有分析函数都必须在这里导出，
//   否则 index.js 里调用会直接抛 ReferenceError: xxx is not defined
module.exports = {
  data,
  groupBy,
  heightBand,
  areaBand,
  filterBuildings,
  bufferAnalysis,
  nearestPois,
}

