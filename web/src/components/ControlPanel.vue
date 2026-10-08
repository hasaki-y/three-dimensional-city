<template>
  <div class="control-panel">
    <h3>视角控制</h3>
    <button class="btn" @click="store.viewMode = '3d'">3D 三维</button>
    <button class="btn" @click="store.viewMode = '2d'">2D 平面</button>

    <h3>建筑筛选</h3>
    <label>建筑类型</label>
    <select v-model="store.filter.type" class="input">
      <option value="">全部</option>
      <option v-for="t in types" :key="t" :value="t">{{ t }}</option>
    </select>

    <label>最低楼层</label>
    <input
      type="number"
      v-model.number="store.filter.minFloors"
      class="input"
      placeholder="不限"
    />

    <button class="btn reset" @click="resetFilter">重置筛选</button>
    <h3 style="margin-top: 16px">空间分析</h3>
    <button
      class="btn"
      :class="{ active: store.analysisMode === 'buffer' }"
      @click="store.analysisMode = 'buffer'"
    >
      缓冲区分析（300m）
    </button>
    <button
      class="btn"
      :class="{ active: store.analysisMode === 'nearest' }"
      @click="store.analysisMode = 'nearest'"
    >
      最近邻查医院
    </button>
    <button
      v-if="store.analysisMode !== 'none'"
      class="btn"
      @click="store.analysisMode = 'none'"
    >
      {{ store.analysisMode === 'buffer' ? '退出缓冲区分析' : '退出最近邻分析' }}
    </button>
    <p v-if="store.analysisMode !== 'none'" class="tip">👉 在地图上点一个位置</p>

  </div>
</template>

<script setup lang="ts">
import { useStore } from '../store'
const store = useStore()

const types = ['住宅', '商业', '写字楼', '学校', '医院', '政府', '酒店', '文化']

function resetFilter() {
  store.filter.type = ''
  store.filter.minFloors = null
}
</script>

<style scoped>
.control-panel { padding: 0; }
h3 { margin: 0 0 10px; font-size: 14px; color: #5b8ff9; }
label { display: block; font-size: 12px; color: #7a8ba8; margin: 10px 0 4px; }
.input {
  width: 100%;
  padding: 6px;
  background: #0a1428;
  color: #e0e6ed;
  border: 1px solid #1e3a5f;
  border-radius: 4px;
  box-sizing: border-box;
}
.btn {
  display: block;
  width: 100%;
  padding: 8px;
  margin-top: 12px;
  background: #1e3a5f;
  color: #e0e6ed;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}
.btn:hover { background: #2a4f7f; }
.btn.reset { background: #3a1e1e; }
.tip { color: #f6bd16; font-size: 12px; margin-top: 8px; }
.btn.active { background: #2a6f4f; }

</style>
