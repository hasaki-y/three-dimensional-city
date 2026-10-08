import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import fs from 'node:fs'
import path from 'node:path'

// Cesium 是个"特殊"的 npm 包：运行时需要 fetch 一堆静态资源
// （Workers/Assets/Widgets），Vite 默认不帮你处理，必须手动拷贝/代理
const CESIUM_DIR = 'node_modules/cesium/Build/Cesium'

function copyCesium() {
  const src = path.resolve(CESIUM_DIR)
  const dest = path.resolve('dist/cesium')
  fs.cpSync(src, dest, { recursive: true })
  console.log('✓ Cesium 静态资源已拷贝到 dist/cesium')
}

// 自定义 Vite 插件：
//  - dev 模式：把 /cesium/* 请求代理到 node_modules 里的 Cesium 资源
//  - build 模式：打包完成后把资源拷进 dist/cesium
function cesiumAssets(): Plugin {
  return {
    name: 'cesium-assets',
    configureServer(server) {
      // 常见静态资源 MIME 映射
      const mime: Record<string, string> = {
        '.json': 'application/json',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
        '.ttf': 'font/ttf',
        '.wasm': 'application/wasm',
      }
      server.middlewares.use('/cesium', (req, res, next) => {
        const file = path.resolve(CESIUM_DIR, decodeURIComponent(req.url!.replace(/^\//, '')))
        if (fs.existsSync(file) && fs.statSync(file).isFile()) {
          const ext = path.extname(file).toLowerCase()
          res.setHeader('Content-Type', mime[ext] || 'application/octet-stream')
          fs.createReadStream(file).pipe(res)
        } else {
          next()
        }
      })
    },
    closeBundle() {
      copyCesium()
    },
  }
}

export default defineConfig({
  base: './',                 // 用相对路径，部署到服务器任意子目录都能跑
  plugins: [vue(), cesiumAssets()],
  server: {
    port: 5173,
    proxy: {
      // 开发时：前端请求 /api/xxx 自动转发到后端 3001
      // 浏览器只认 5173，代理在后端视角里"假装"是 5173 发出的
      '/api': 'http://localhost:3001',
    },
  },
})
