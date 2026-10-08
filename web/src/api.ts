import type { BuildingProps } from './store'

const BASE = '/api'

// 统一 fetch 封装：错误统一处理，返回带 TS 类型
async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error('请求失败: ' + path)
  return res.json()
}

export const api = {
  overview: () => get<{ buildings: number; pois: number; roads: number }>('/overview'),
  aggregate: (by: string) => get<{ name: string; count: number }[]>(`/aggregate?by=${by}`),
  buildings: (params: Record<string, string | number>) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString()
    return get<{ total: number; buildings: BuildingProps[] }>(`/buildings?${qs}`)
  },
  buffer: (lon: number, lat: number, radiusKm: number) =>
    get<any>(`/buffer?lon=${lon}&lat=${lat}&radius=${radiusKm}`),
  nearest: (lon: number, lat: number, type: string, limit = 5) =>
    get<{ count: number; results: any[] }>(`/nearest?lon=${lon}&lat=${lat}&type=${type}&limit=${limit}`),
}
