import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SUPABASE_URL = 'https://tdviauwlnwygavtyvdyj.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkdmlhdXdsbnd5Z2F2dHl2ZHlqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ4MTc5NiwiZXhwIjoyMDg4MDU3Nzk2fQ.teiHuLB6oi8GNT_lckPHdW1YHqSNgK9KBwoFniUE3Pk'

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

const filePath = path.join(__dirname, '../public/templates/russia.xlsx')
const buffer = fs.readFileSync(filePath)

// 把 Buffer 转成 Blob，让 SDK 走 FormData 路径（绕开 duplex 问题）
const blob = new Blob([buffer], {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
})

console.log('上传 russia.xlsx (Blob)...')
const { error } = await db.storage
  .from('templates')
  .upload(`test/${Date.now()}_russia.xlsx`, blob, { upsert: true })

if (error) {
  console.error('❌ 上传失败:', error.message, error.statusCode)
} else {
  console.log('✅ 上传成功！')
}
