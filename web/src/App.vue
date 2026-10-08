<template>
  <div class="app">
    <header class="topbar">
      <h1>三维城市数字孪生平台</h1>
      <span class="subtitle">杭州未来科技城 · WebGIS 空间分析演示</span>
    </header>

    <div class="main">
      <aside class="panel left">
         <ControlPanel />
      </aside>


      <div class="scene-wrap">
        <CityScene />
        <ParticleLayer />
      </div>


      <aside class="panel right">
        <StatisticsPanel />
        <FeatureInfo />
      </aside>

    </div>
  </div>
</template>

<script setup lang="ts">
import ParticleLayer from './components/ParticleLayer.vue'
import StatisticsPanel from './components/StatisticsPanel.vue'
import ControlPanel from './components/ControlPanel.vue'
import CityScene from './components/CityScene.vue'
import FeatureInfo from './components/FeatureInfo.vue'
</script>

<style>
/* 全局布局。原项目这里没有 <style>，.app/.main/.topbar/.panel/.scene-wrap
   这些类名全都没有任何样式规则 → 三栏布局完全不成立。 */
.app {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.topbar {
  flex-shrink: 0;
  height: 62px;
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 0 20px;
  background: linear-gradient(90deg, #0b1a30, #0a1428);
  border-bottom: 1px solid #1e3a5f;
}
.topbar h1 {
  font-size: 18px;
  font-weight: 600;
  color: #e0e6ed;
  letter-spacing: 1px;
}
.subtitle { font-size: 12px; color: #7a8ba8; }

/* ⭐ min-height: 0 必须！flex 子项默认 min-height:auto，
   会让下面的 panel 撑破屏幕、overflow-y:auto 失效 */
.main {
  flex: 1;
  display: flex;
  min-height: 0;
}

.panel {
  flex-shrink: 0;
  padding: 16px;
  background: rgba(10, 20, 40, 0.92);
  overflow-y: auto;
}
.panel.left  { width: clamp(220px, 20vw, 260px); border-right: 1px solid #1e3a5f; }
.panel.right { width: clamp(300px, 28vw, 380px); border-left: 1px solid #1e3a5f; }

/* ⭐ position: relative 必须！
   CityScene 的 .city-scene 和 ParticleLayer 的 .particle-layer 都是
   position:absolute; inset:0。父容器不是定位元素时，它们会相对
   “初始包含块”（≈整个视口）定位，直接盖住左右两个面板。 */
.scene-wrap {
  flex: 1;
  position: relative;
  min-width: 300px;
  overflow: hidden;
}
</style>
