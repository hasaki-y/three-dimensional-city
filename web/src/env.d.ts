/// <reference types="vite/client" />

// ★ 缺了这个声明文件，`import App from './App.vue'` 会报
//   TS2307: Cannot find module './App.vue' or its corresponding type declarations.
//   Vite 打包不看类型能跑，但编辑器一片红、`tsc --noEmit` 直接失败。
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
