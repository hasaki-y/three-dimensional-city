import { defineStore } from 'pinia'

// 建筑数据的 TS 类型（和后端 properties 一一对应）
export interface BuildingProps {
  id: string
  name: string
  type: string
  district: string
  floors: number
  height: number
  area: number
  year: number
  lon: number
  lat: number
}

// Pinia store：跨组件共享状态
// CityScene 点中建筑 → 存进 store → FeatureInfo 面板读 store 显示
export const useStore = defineStore('main', {
  state: () => ({
    viewMode: '3d' as '3d' | '2d',          // 当前视角
    selected: null as BuildingProps | null, // 当前选中的建筑
    filter: { type: '', minFloors: null, maxYear: null },  // 筛选条件
    analysisMode: 'none' as 'none' | 'buffer' | 'nearest',
    bufferResult: null as any,              // 缓冲区分析结果
    nearestResults: [] as any[],            // KNN 结果
  }),
  actions: {
    selectBuilding(b: BuildingProps | null) {
      this.selected = b
    },
  },
})
