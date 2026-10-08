<template>
  <div class="feature-info">
    <h3>要素信息</h3>

    <div v-if="store.selected" class="info">
      <div class="row"><span class="label">名称</span><span>{{ store.selected.name }}</span></div>
      <div class="row"><span class="label">类型</span><span>{{ store.selected.type }}</span></div>
      <div class="row"><span class="label">片区</span><span>{{ store.selected.district }}</span></div>
      <div class="row"><span class="label">楼层</span><span>{{ store.selected.floors }} 层</span></div>
      <div class="row"><span class="label">高度</span><span>{{ store.selected.height.toFixed(1) }} m</span></div>
      <div class="row"><span class="label">面积</span><span>{{ store.selected.area }} ㎡</span></div>
      <div class="row"><span class="label">建成</span><span>{{ store.selected.year }} 年</span></div>
      <div class="row">
        <span class="label">坐标</span>
        <span>{{ store.selected.lon.toFixed(5) }}, {{ store.selected.lat.toFixed(5) }}</span>
      </div>
    </div>

    <p v-else class="hint">点击场景中的建筑查看属性</p>
  </div>
</template>

<script setup lang="ts">
import { useStore } from '../store'
const store = useStore()
</script>

<style scoped>
.feature-info { padding: 0; }
h3 { margin: 0 0 12px; font-size: 14px; color: #5b8ff9; }
.info .row {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid #1e3a5f;
  font-size: 13px;
}
.label { color: #7a8ba8; }
.hint { color: #7a8ba8; font-size: 13px; }
</style>
