import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // pdf-parse 依赖 canvas 相关原生模块，在 Next.js 服务端打包时需要排除
  serverExternalPackages: ['pdf-parse', 'canvas', '@napi-rs/canvas'],

  // 允许较大文件上传（最大 50MB）
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
  },
}

export default nextConfig
