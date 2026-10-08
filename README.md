# 三维城市数字孪生 WebGIS 平台

> 基于 Vue3 + Cesium + Three.js 的三维城市数字孪生平台，数据模拟杭州未来科技城（3489 栋建筑、670 个 POI），支持二三维联动、建筑属性拾取、条件筛选、缓冲区分析与 KNN 最近邻查询，配套 ECharts 城市指标大屏。

## 功能特性



* **三维场景**：Cesium 加载 3489 栋建筑 Box 拉伸体，按 8 类用地性质着色，万级要素流畅交互

* **二三维联动**：3D / 2D 模式无缝切换，基于 `morphComplete` 事件驱动取景，避免相机错位

* **属性拾取**：点击建筑查询名称、类型、楼层、高度等属性（Entity + 外部 Map 映射）

* **条件筛选**：按建筑类型、最低楼层实时筛选

* **空间分析**：


  * 缓冲区分析（Buffer）：点击地图生成 300m 缓冲区，统计覆盖建筑

  * KNN 最近邻：查询距点击点最近的 N 家医院并连线

* **统计大屏**：ECharts 建筑类型环形图、高度分段柱状图

* **粒子特效**：Three.js 独立 WebGL 画布叠加全屏粒子，鼠标穿透不干扰地图交互

## 技术栈



| 分层    | 技术                                                                 |
| ----- | ------------------------------------------------------------------ |
| 前端框架  | Vue 3 + TypeScript + Vite                                          |
| 状态管理  | Pinia                                                              |
| 三维引擎  | Cesium 1.145                                                       |
| 3D 特效 | Three.js 0.170                                                     |
| 统计图表  | ECharts 5                                                          |
| 后端    | Node.js + Express                                                  |
| 空间计算  | Turf.js（buffer / distance / nearest-point / points-within-polygon） |
| 数据格式  | GeoJSON                                                            |
| 进程管理  | concurrently（一键启动前后端）                                              |

## 项目结构



```
三维衍生-亲手版/

├── package.json              # 根目录：concurrently 一键启动前后端

├── server/                   # 后端

│   ├── package.json

│   ├── src/

│   │   ├── index.js          # Express 入口 + 6 个业务接口 + 健康检查

│   │   └── spatial.js        # GeoJSON 加载 + Turf 空间计算

│   ├── scripts/

│   │   └── generate-data.js  # LCG 确定性随机数据生成器

│   └── data/                 # 生成的 GeoJSON 数据

│       ├── buildings.geojson (3489 栋)

│       ├── pois.geojson      (670 个 POI)

│       ├── roads/districts/water/parks.geojson

│       └── bounds.json

└── web/                      # 前端

&#x20;   ├── package.json

&#x20;   ├── vite.config.ts        # Vite 配置（Cesium 静态资源代理 + /api 转发）

&#x20;   ├── index.html

&#x20;   └── src/

&#x20;       ├── main.ts           # 入口：挂载 Pinia + Cesium 静态资源

&#x20;       ├── App.vue           # 三栏布局

&#x20;       ├── config.ts         # 中心坐标、配色等常量

&#x20;       ├── store.ts          # Pinia 全局状态

&#x20;       ├── api.ts            # fetch 封装 + TS 类型

&#x20;       ├── style.css

&#x20;       └── components/

&#x20;           ├── CityScene.vue       # 核心：Cesium 三维场景、拾取、空间分析

&#x20;           ├── ControlPanel.vue    # 左栏：视角切换、筛选、分析按钮

&#x20;           ├── FeatureInfo.vue     # 右栏：选中建筑属性

&#x20;           ├── StatisticsPanel.vue # 右栏：ECharts 统计

&#x20;           └── ParticleLayer.vue   # Three.js 粒子特效
```

## 快速开始

### 环境要求



* Node.js ≥ 18（开发环境 Node 24 /npm 11）

* npm 或 pnpm

### 安装与启动



```
\# 1. 安装根目录依赖（concurrently）

npm install

\# 2. 安装后端依赖

npm install --prefix server

\# 3. 安装前端依赖

npm install --prefix web

\# 4. 一键启动前后端

npm run dev
```

启动后：



* 前端：[http://localhost:5173](http://localhost:5173)

* 后端：[http://localhost:3001](http://localhost:3001)

也可以分开启动：



```
\# 终端 1：后端（端口 3001）

npm run dev --prefix server

\# 终端 2：前端（端口 5173）

npm run dev --prefix web
```

### 重新生成数据（可选）



```
cd server

node scripts/generate-data.js
```

生成器使用固定随机种子（LCG），每次输出结果一致，便于复现。

### 构建部署



```
npm run build --prefix web
```

产物在 `web/dist`，`vite.config.ts` 已配置 `base: './'`，可部署到任意子目录；Cesium 静态资源会在构建时自动拷贝到 `dist/cesium`。

## 接口文档

后端基址 `http://localhost:3001`，开发环境通过 Vite 代理 `/api` 转发。



| 方法  | 路径                                   | 说明                 |
| --- | ------------------------------------ | ------------------ |
| GET | `/api/health`                        | 健康检查               |
| GET | `/api/overview`                      | 城市总览（建筑 / POI / 道路等要素数量） |
| GET | `/api/aggregate?by=type`             | 按类型聚合（环形图）         |
| GET | `/api/aggregate?by=heightBand`       | 按高度分段聚合（柱状图）       |
| GET | `/api/buildings?type=&minFloors=`    | 建筑查询，支持类型 / 楼层 / 年份筛选 |
| GET | `/api/buffer?lon=&lat=&radius=`      | 缓冲区分析（radius 单位 km，默认 0.5），返回覆盖建筑 |
| GET | `/api/nearest?lon=&lat=&type=医院&limit=5` | KNN 最近邻查询（limit 默认 5） |

### 空间分析实现



* **缓冲区**：`@turf/buffer` 以点击点为圆心生成圆形 polygon → `@turf/points-within-polygon` 统计落在缓冲区内的建筑

* **KNN**：`@turf/nearest-point` 在目标类型 POI 中求最近点，循环 k 次得到最近邻，前端用 `polyline` 连线

## 核心实现要点

**1. Cesium 静态资源处理**

Cesium 运行时需要 Workers / Assets / Widgets 等静态资源，Vite 默认不处理。通过自定义 Vite 插件：dev 用中间件代理 `/cesium/*`，build 时 `fs.cpSync` 拷贝到 `dist/cesium`。

**2. 建筑渲染与拾取**

每栋建筑为一个 `Entity`，Box 以 `position` 为中心（需抬到 `height/2` 才不会埋地）。建筑属性不挂在 Entity 上，而是用外部 `Map<entityId, BuildingProps>` 存储，点击拾取时 `scene.pick` 拿到 id 后 O (1) 查属性。

**3. 二三维切换（关键坑）**

Cesium 的 `morphTo2D/3D` 动画终点是 "整个地球"（相机高度约 31890km），且 `camera.setView` 在变形动画期间是静默空操作。因此不能用 `setTimeout` 赌动画结束，改为监听 `scene.morphComplete` 事件后重新取景；2D 用 `Rectangle` 按建筑外包框取景，3D 用固定相机高度 + 45° 俯角。

**4. 双 WebGL 画布叠加**

Three.js 粒子层是独立 canvas，绝对定位覆盖在 Cesium 上方，`pointer-events: none` 保证鼠标事件穿透到地图，`z-index` 控制层级，组件卸载时 dispose 并移除节点。

## 踩坑记录



* Turf.js 7.x 必须解构导入：`const { buffer } = require('@turf/buffer')`，直接 `require()` 当函数调用会报错

* Vite 的 Connect 中间件不支持 `res.sendFile`，改用 `fs.createReadStream().pipe(res)`

* 不引 `widgets.css` 会导致 Cesium canvas 退化为 300×150

* Cesium Box 以 position 为几何中心，建筑需抬到 `height/2`，否则一半埋在地下

* `morphTo2D/3D` 后用 `setTimeout` 重新取景不可靠，必须用 `morphComplete` 事件

* PowerShell 安装 `@types/node` 时 `@` 需加双引号：`npm install -D "@types/node"`

## 后续规划



* [ ] 用 **PostGIS** 替换 Turf.js 内存计算：`ST_GeomFromGeoJSON` 入库、GIST 空间索引、`ST_Buffer` 缓冲区、`<->` 算子 KNN、`ST_AsGeoJSON` 统一返回

* [ ] 3D Tiles 切片加载，支撑十万级以上建筑

* [ ] POI 图层渲染 + `EntityCluster` 聚合标注（670 个 POI 目前只参与 KNN 计算，未渲染到场景）

* [ ] 渲染 roads / districts / water / parks 矢量图层（后端已加载并统计，前端目前只渲染建筑）

* [ ] 录制演示视频

## 技术许可证

本项目仅用于学习与求职演示。