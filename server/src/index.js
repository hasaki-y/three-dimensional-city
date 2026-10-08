const express = require('express')
const cors = require('cors')

// 引入数据模块 + 全部分析函数（少写一个，对应接口就会 500）
const {
  data,
  groupBy,
  heightBand,
  areaBand,
  filterBuildings,
  bufferAnalysis,
  nearestPois,
} = require('./spatial')
const app = express()
const PORT = 3001

// ★坑：中间件必须先注册，再注册路由。
//   Express 按注册顺序执行，写在路由后面的 app.use() 对前面的路由完全不生效
//   （原代码 cors 写在最后 → 概览/聚合/筛选/分析接口全部没有 CORS 头）
app.use(cors())
app.use(express.json())

// ===== 参数解析工具 =====
// ★坑：原来写的是 `if (!lon || !lat)`。
//   lon/lat 是合法经纬度时 0 也是有效值（几内亚湾、本初子午线），
//   但 0 是 falsy → 合法坐标被当成"缺参数"直接 400。
//   正确做法：只判断"是不是有限数字"，NaN 才是真正的非法输入。
function toNum(v) {
  if (v === undefined || v === null || v === '') return NaN
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}

// 数值型筛选条件：非法值一律当"没传"（null），不要留下 NaN 污染比较
function numOrNull(v) {
  const n = toNum(v)
  return Number.isNaN(n) ? null : n
}

// ===== 概览接口：返回各要素数量 =====
app.get('/api/overview', (req, res) => {
  res.json({
    buildings: data.buildings.features.length,
    pois: data.pois.features.length,
    roads: data.roads.features.length,
    districts: data.districts.features.length,
    water: data.water.features.length,
    parks: data.parks.features.length,
  })
})
// ===== 聚合统计接口：/api/aggregate?by=district|type|heightBand|areaBand =====
app.get('/api/aggregate', (req, res) => {
  const by = req.query.by || 'district'     // 默认按片区聚合
  const buildings = data.buildings.features
  let result
  switch (by) {
    case 'type':      result = groupBy(buildings, p => p.type); break
    case 'district':  result = groupBy(buildings, p => p.district); break
    case 'heightBand': result = groupBy(buildings, p => heightBand(p.height)); break
    case 'areaBand':  result = groupBy(buildings, p => areaBand(p.area)); break
    default:
      // 参数不合法：返回 400，并告诉前端支持哪些
      return res.status(400).json({ error: '不支持的聚合维度: ' + by, supported: ['district', 'type', 'heightBand', 'areaBand'] })
  }
  res.json(result)
})
// ===== 建筑筛选接口：/api/buildings?type=住宅&minFloors=15&maxYear=2020 =====
app.get('/api/buildings', (req, res) => {
  const q = req.query
  const cond = {
    type:      q.type,
    district:  q.district,
    // 注意：URL 参数全是字符串，必须 Number() 转成数字。
    // ★坑：`Number('abc')` 是 NaN，NaN 参与比较永远为 false → 条件被静默忽略，
    //   调用方以为"筛过了"，其实返回了全量。这里统一转成 null（= 不参与筛选）。
    minFloors: numOrNull(q.minFloors),
    maxFloors: numOrNull(q.maxFloors),
    minYear:   numOrNull(q.minYear),
    maxYear:   numOrNull(q.maxYear),
  }
  const result = filterBuildings(cond)
  res.json({ total: result.length, buildings: result })
})
// ===== 缓冲区分析接口：/api/buffer?lon=120.028&lat=30.277&radius=0.5 =====
app.get('/api/buffer', (req, res) => {
  const lon = toNum(req.query.lon)
  const lat = toNum(req.query.lat)
  // radius 缺省 0.5 公里；显式传了才解析
  const radius = req.query.radius === undefined ? 0.5 : toNum(req.query.radius)

  // 参数校验：非法就 400，不静默返回空结果
  if (Number.isNaN(lon) || Number.isNaN(lat)) {
    return res.status(400).json({ error: 'lon/lat 参数缺失或不是数字' })
  }
  // ★坑：radius 不校验会把 Turf 打崩。
  //   负数半径 → buffer() 返回 undefined → pointsWithinPolygon 读 .type 抛 TypeError → 500
  if (Number.isNaN(radius) || radius <= 0) {
    return res.status(400).json({ error: 'radius 必须是大于 0 的数字（单位：公里）' })
  }
  res.json(bufferAnalysis(lon, lat, radius))
})
// ===== KNN 最近邻接口：/api/nearest?lon=120.028&lat=30.277&type=医院&limit=5 =====
app.get('/api/nearest', (req, res) => {
  const lon = toNum(req.query.lon)
  const lat = toNum(req.query.lat)
  const poiType = req.query.type || '医院'   // 默认找医院
  const limit = req.query.limit === undefined ? 5 : toNum(req.query.limit)

  if (Number.isNaN(lon) || Number.isNaN(lat)) {
    return res.status(400).json({ error: 'lon/lat 参数缺失或不是数字' })
  }
  // limit 非法（NaN / <1）时回落到默认 5，避免返回空结果让人误以为"附近没有"
  const safeLimit = Number.isNaN(limit) || limit < 1 ? 5 : Math.floor(limit)
  res.json(nearestPois(lon, lat, poiType, safeLimit))
})


app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() })
})

// ===== 兜底：未匹配的 /api/* 返回 JSON 404，而不是 Express 默认的 HTML =====
app.use('/api', (req, res) => {
  res.status(404).json({ error: '接口不存在: ' + req.originalUrl })
})

// ===== 统一错误处理：任何路由里抛异常都返回 JSON，而不是 HTML 错误页 =====
// ★坑：Express 的默认错误处理会返回一整页 HTML + 调用栈。
//   前端 fetch 拿到 500 后 res.json() 会解析失败，报一个和真实原因无关的错，
//   排查时完全看不出是后端哪个函数炸了。
//   注意：错误处理中间件必须写 4 个参数，少一个 Express 就不认它是错误处理器。
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[api error]', err)
  res.status(500).json({ error: err.message || '服务器内部错误' })
})
app.listen(PORT, () => {
  console.log(`gis服务已启动：http://localhost:${PORT}`)
})
