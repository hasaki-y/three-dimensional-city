// 数据生成器：生成一套可复现的模拟城市数据（GeoJSON 格式）
const fs = require('fs')
const path = require('path')

// ===== 1. 确定性随机数（LCG 线性同余算法） =====
// 目的：同样种子 → 永远生成同样的数据 → 项目可复现
// 这是 LCG 的核心公式：state = (state × a + c) mod 2^32
function createRandom(seed) {
  let state = seed >>> 0          // 转成无符号 32 位整数
  return function () {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296     // 归一化到 [0, 1) 之间
  }
}
const rand = createRandom(20260913)   // 种子写死：2026-09-13

// 取 [min, max] 闭区间的随机整数
function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min
}

// 从数组里随机取一个元素
function pick(arr) {
  return arr[Math.floor(rand() * arr.length)]
}

// ===== 2. 城市基础参数 =====
const CENTER = { lon: 120.028, lat: 30.277 }   // 杭州未来科技城附近
const EXTENT = { width: 0.06, height: 0.045 }  // 约 6km × 4.5km

// ===== 2.5 片区定义（城市按片区规划） =====
// 每个片区 = 一个椭圆区域：cx/cy 中心点，rx/ry 椭圆半轴（单位：度）
// 1 度纬度 ≈ 111km，1 度经度在杭州(30°N) ≈ 96km，所以 rx:0.02 ≈ 1.9km
const DISTRICTS = [
  { id: 1, name: '未来科技城核心区', cx: 120.030, cy: 30.278, rx: 0.020, ry: 0.012, floors: [3, 30] },
  { id: 2, name: '梦想小镇片区',     cx: 120.024, cy: 30.274, rx: 0.014, ry: 0.009, floors: [2, 12] },
  { id: 3, name: '海创园片区',       cx: 120.034, cy: 30.274, rx: 0.013, ry: 0.008, floors: [4, 20] },
  { id: 4, name: '西溪湿地东岸',     cx: 120.020, cy: 30.282, rx: 0.012, ry: 0.008, floors: [2, 8]  },
  { id: 5, name: '文一西路商务区',   cx: 120.033, cy: 30.283, rx: 0.016, ry: 0.009, floors: [6, 35] },
]

// ===== 2.6 建筑类型与名称库 =====
const BUILDING_TYPES = ['住宅', '商业', '写字楼', '学校', '医院', '政府', '酒店', '文化']
const TYPE_NAMES = {
  '住宅':   ['阳光', '翡翠', '金地', '万科', '碧桂园', '龙湖', '绿城', '滨江'],
  '商业':   ['银泰', '万达', '龙湖天街', '印象城', '万象汇', '宝龙'],
  '写字楼': ['科创', '数智', '未来', '云谷', '中科', '慧谷'],
  '学校':   ['实验小学', '第一中学', '职业技术学院', '外国语学校'],
  '医院':   ['人民医院', '中医院', '妇幼保健院', '口腔医院'],
  '政府':   ['市民中心', '税务局', '行政审批中心', '派出所'],
  '酒店':   ['希尔顿', '全季', '亚朵', '维也纳', '桔子'],
  '文化':   ['图书馆', '博物馆', '美术馆', '科技馆'],
}

// ===== 2.7 拒绝采样：在椭圆片区里随机取一个点 =====
function randomPointInEllipse(d) {
  for (let i = 0; i < 50; i++) {
    // 先在椭圆的外接矩形里随机取点
    const lon = d.cx + (rand() * 2 - 1) * d.rx
    const lat = d.cy + (rand() * 2 - 1) * d.ry
    // 椭圆方程判断：((dx/rx)^2 + (dy/ry)^2) <= 1 才落在椭圆内
    const dx = (lon - d.cx) / d.rx
    const dy = (lat - d.cy) / d.ry
    if (dx * dx + dy * dy <= 1) return { lon, lat }
  }
  return { lon: d.cx, lat: d.cy }  // 兜底：50 次都没中就用中心点
}

// ===== 3. 生成 3489 栋建筑 =====
const BUILDING_COUNT = 3489
const buildings = []
for (let i = 0; i < BUILDING_COUNT; i++) {
  const d = pick(DISTRICTS)                    // 随机选一个片区
  const { lon, lat } = randomPointInEllipse(d) // 在片区里取一个落点
  const type = pick(BUILDING_TYPES)            // 随机类型
  const floors = randInt(d.floors[0], d.floors[1]) // 楼层数受片区限制

  buildings.push({
    id: `B${i + 1}`,
    name: `${pick(TYPE_NAMES[type])}${type} ${randInt(1, 20)}`,
    type,
    district: d.name,
    floors,
    height: floors * 3.2 + randInt(0, 3), // 层高约 3.2 米，所以高度≈楼层×3.2
    area: randInt(600, 3600),              // 建筑面积（㎡），后面三维渲染的底面大小
    year: randInt(2000, 2025),             // 建成年代，后面做筛选分析
    lon,
    lat,
  })
}

// ===== 3.5 生成 POI（兴趣点：餐厅/商场/公交站等 12 类，共 670 个） =====
const POI_TYPES = ['餐厅', '商场', '公交站', '地铁站', '停车场', '银行', '酒店', '药店', '加油站', '医院', '学校', '便利店']
const POI_NAMES = {
  '餐厅':   ['川味居', '杭帮菜馆', '沙县小吃', '麦当劳', '肯德基', '海底捞', '外婆家', '绿茶餐厅'],
  '商场':   ['银泰城', '万达广场', '龙湖天街', '印象城', '宝龙城'],
  '公交站': ['梦想小镇南', '海创园东', '文一西路东', '科创大道口', '市民中心北'],
  '地铁站': ['创景路站', '良睦路站', '海创园站', '文一西路站'],
  '停车场': ['P1地下停车场', 'P2立体停车场', 'P3露天停车场', 'P4临时停车场'],
  '银行':   ['中国银行', '工商银行', '建设银行', '农业银行', '招商银行'],
  '酒店':   ['希尔顿酒店', '全季酒店', '亚朵酒店', '维也纳酒店', '桔子酒店'],
  '药店':   ['老百姓大药房', '海王星辰', '益丰大药房', '九州通药房'],
  '加油站': ['中石化加油站', '中石油加油站', '民营加油站'],
  '医院':   ['人民医院', '中医院', '妇幼保健院', '口腔医院'],
  '学校':   ['实验小学', '第一中学', '职业技术学院', '外国语学校'],
  '便利店': ['全家', '罗森', '7-11', '便利蜂'],
}

const POI_COUNT = 670
const pois = []
const nameCount = {}  // 同名去重计数器：key = 类型:名称
for (let i = 0; i < POI_COUNT; i++) {
  const d = pick(DISTRICTS)
  const { lon, lat } = randomPointInEllipse(d)
  const type = pick(POI_TYPES)
  const base = pick(POI_NAMES[type])
  // 同类同名出现第 2 次起加序号：'外婆家' → '外婆家 2'
  const key = type + ':' + base
  nameCount[key] = (nameCount[key] || 0) + 1
  const name = nameCount[key] > 1 ? `${base} ${nameCount[key]}` : base
  pois.push({ id: `P${i + 1}`, name, type, district: d.name, lon, lat })
}

// ===== 3.6 道路：横 5 条 + 纵 5 条，形成路网 =====
const roads = []
for (let i = 0; i < 5; i++) {  // 横向路：纬度固定
  roads.push({ id: `R${i + 1}`, name: `文${i + 1}路`, type: '主干道',
    coords: [[120.016, 30.276 + i * 0.0025], [120.040, 30.276 + i * 0.0025]] })
}
for (let i = 0; i < 5; i++) {  // 纵向路：经度固定
  roads.push({ id: `R${i + 6}`, name: `纵${i + 1}街`, type: '次干道',
    coords: [[120.022 + i * 0.0045, 30.270], [120.022 + i * 0.0045, 30.288]] })
}

// ===== 3.7 片区面 / 水系 / 公园：椭圆近似成 8 边形（Polygon） =====
function ellipsePolygon(d, n = 8) {
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    pts.push([d.cx + d.rx * Math.cos(a), d.cy + d.ry * Math.sin(a)])
  }
  pts.push(pts[0])  // 首尾相连，闭合多边形
  return pts
}
const districts = DISTRICTS.map(d => ({ id: d.id, name: d.name, type: '片区', coords: ellipsePolygon(d) }))

const WATER = [
  { name: '五常湿地水系', cx: 120.022, cy: 30.279, rx: 0.008, ry: 0.004 },
  { name: '闲林港',       cx: 120.036, cy: 30.276, rx: 0.006, ry: 0.003 },
  { name: '西溪湿地河网', cx: 120.017, cy: 30.285, rx: 0.009, ry: 0.004 },
]
const water = WATER.map((w, i) => ({ id: `W${i + 1}`, name: w.name, type: '水系', coords: ellipsePolygon(w) }))

const PARKS = [
  { name: '中央公园', cx: 120.028, cy: 30.280, rx: 0.006, ry: 0.004 },
  { name: '滨水绿廊', cx: 120.031, cy: 30.272, rx: 0.005, ry: 0.003 },
  { name: '社区公园', cx: 120.025, cy: 30.276, rx: 0.004, ry: 0.003 },
]
const parks = PARKS.map((p, i) => ({ id: `PK${i + 1}`, name: p.name, type: '公园', coords: ellipsePolygon(p) }))

// ===== 4. 输出 GeoJSON（地理数据标准格式） =====
const DATA_DIR = path.join(__dirname, '..', 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

// GeoJSON 三种几何：Point 点 / LineString 线 / Polygon 面
function point(lon, lat, props) {
  return { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: props }
}
function line(coords, props) {
  return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: props }
}
function polygon(coords, props) {
  return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [coords] }, properties: props }
}
const fc = features => ({ type: 'FeatureCollection', features })

fs.writeFileSync(path.join(DATA_DIR, 'buildings.geojson'), JSON.stringify(fc(buildings.map(b => point(b.lon, b.lat, b)))))
fs.writeFileSync(path.join(DATA_DIR, 'pois.geojson'),       JSON.stringify(fc(pois.map(p => point(p.lon, p.lat, p)))))
fs.writeFileSync(path.join(DATA_DIR, 'roads.geojson'),      JSON.stringify(fc(roads.map(r => line(r.coords, r)))))
fs.writeFileSync(path.join(DATA_DIR, 'districts.geojson'),  JSON.stringify(fc(districts.map(d => polygon(d.coords, d)))))
fs.writeFileSync(path.join(DATA_DIR, 'water.geojson'),      JSON.stringify(fc(water.map(w => polygon(w.coords, w)))))
fs.writeFileSync(path.join(DATA_DIR, 'parks.geojson'),      JSON.stringify(fc(parks.map(p => polygon(p.coords, p)))))
fs.writeFileSync(path.join(DATA_DIR, 'bounds.json'),
  JSON.stringify({ center: CENTER, extent: EXTENT }))

// ===== 5. 最终验证 =====
console.log('建筑:', buildings.length, '| POI:', pois.length)
console.log('道路:', roads.length, '| 片区:', districts.length, '| 水系:', water.length, '| 公园:', parks.length)
console.log('已生成文件:', fs.readdirSync(DATA_DIR).join(', '))
