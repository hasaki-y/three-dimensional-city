// 场景配置：集中放常量，别散落在组件里
export const SCENE_CONFIG = {
  center: { lon: 120.028, lat: 30.277 },

  // —— 相机取景 ——
  // 3D：setView 的语义是"把相机放到 destination 这个点"，不是"看向它"，
  //     所以 destination 直接用城市中心本身；俯角必须是负的
  //     （和 camera.lookAt 的 HeadingPitchRange 符号相反，别混用）。
  camera3DHeight: 1200,  // 米
  camera3DPitch: -45,    // 度

  // 2D：不写死高度。2D 的可见宽度 = 相机高度，可见高度还要再乘画布宽高比，
  //     写死一个米数在不同窗口比例下会把城区切掉，所以按建筑外包框算矩形，
  //     由 Cesium 自己算相机高度（Camera.getRectangleCameraCoordinates）。
  //     下面是"一栋楼都没取到"时的兜底矩形（单位：度）。
  camera2DFallbackHalfLon: 0.025,
  camera2DFallbackHalfLat: 0.018,
  // 8 种建筑类型配色（和数据生成器一一对应）
  BUILDING_COLORS: {
    '住宅': '#5B8FF9',
    '商业': '#F6BD16',
    '写字楼': '#5AD8A6',
    '学校': '#945FB9',
    '医院': '#E86452',
    '政府': '#6DC8EC',
    '酒店': '#FF9845',
    '文化': '#1E9493',
  } as Record<string, string>,
}
