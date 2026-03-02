import { createClient } from '@supabase/supabase-js'

// 服务端专用客户端（使用 service_role key，绕过 RLS，仅在 API Routes 中使用）
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )
}
