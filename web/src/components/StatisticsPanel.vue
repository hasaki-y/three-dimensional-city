<template>
  <div class="statistics-panel">
    <h3>城市统计</h3>
    <div ref="pieRef" class="chart"></div>
    <div ref="barRef" class="chart"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { api } from '../api'

const pieRef = ref<HTMLDivElement | null>(null)
const barRef = ref<HTMLDivElement | null>(null)
let pieChart: echarts.ECharts | null = null
let barChart: echarts.ECharts | null = null

onMounted(async () => {
  // 1. 初始化两个图表（绑定到 DOM）
  pieChart = echarts.init(pieRef.value!)
  barChart = echarts.init(barRef.value!)

  // 2. 并行拉两份聚合数据（Promise.all 同时发）
  //   ★坑：这里没有 try/catch，后端没启动时 Promise.all 直接 reject，
  //     onMounted 里的 await 会抛成一个"未处理的 Promise 拒绝"，
  //     两个图表就停在空白状态，控制台也看不出是接口挂了。
  let byType: { name: string; count: number }[]
  let byHeight: { name: string; count: number }[]
  try {
    ;[byType, byHeight] = await Promise.all([
      api.aggregate('type'),
      api.aggregate('heightBand'),
    ])
  } catch (e) {
    console.error('[StatisticsPanel] 统计数据加载失败，请确认后端 3001 已启动：', e)
    return
  }

  // 3. 饼图：建筑类型分布
  pieChart.setOption({
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, textStyle: { color: '#e0e6ed', fontSize: 10 } },
    series: [
      {
        type: 'pie',
        radius: ['30%', '60%'],
        data: byType.map((i: any) => ({ name: i.name, value: i.count })),
        label: { color: '#e0e6ed', fontSize: 10 },
      },
    ],
  })

  // 4. 柱状图：建筑高度段分布
  barChart.setOption({
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 10, top: 20, bottom: 24 },
    xAxis: {
      type: 'category',
      data: byHeight.map((i: any) => i.name),
      axisLabel: { color: '#e0e6ed', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: '#e0e6ed', fontSize: 10 },
    },
    series: [
      {
        type: 'bar',
        data: byHeight.map((i: any) => i.count),
        itemStyle: { color: '#5b8ff9' },
      },
    ],
  })
})

// ★坑：ECharts 不像 Cesium 那样自己监听窗口尺寸。
//   右侧面板宽度是 clamp() 响应式的，窗口一变宽，面板宽度跟着变，
//   但图表还停在初始化时的像素尺寸 → 饼图/柱图被拉伸变形。
const onResize = () => {
  pieChart?.resize()
  barChart?.resize()
}
onMounted(() => window.addEventListener('resize', onResize))

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  // ★销毁图表，防内存泄漏（和 Cesium viewer.destroy 一个道理）
  pieChart?.dispose()
  barChart?.dispose()
})
</script>

<style scoped>
.statistics-panel { margin-bottom: 16px; }
h3 { margin: 0 0 10px; font-size: 14px; color: #5b8ff9; }
.chart { width: 100%; height: 160px; margin-bottom: 12px; }
</style>
