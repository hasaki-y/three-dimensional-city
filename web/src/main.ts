import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './style.css'
// ★关键坑：Cesium 的样式必须引入，否则 canvas 会退化到 300x150
import 'cesium/Build/Cesium/Widgets/widgets.css'

// 告诉 Cesium 去哪里找它的静态资源（和 vite.config.ts 里的代理对应）
// dev 走 /cesium/，build 后走相对路径 ./cesium/
(window as any).CESIUM_BASE_URL = import.meta.env.DEV ? '/cesium/' : './cesium/'

createApp(App).use(createPinia()).mount('#app')
