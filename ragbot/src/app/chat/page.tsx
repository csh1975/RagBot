import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { ChatInterface } from '@/components/chat/ChatInterface'
import { cookies } from 'next/headers'

export const metadata: Metadata = {
  title: '챗봇 - RagBot',
}

/** JWT 쿠키에서 user_id 추출 */
function getUserIdFromAuthCookie(cookieStore: Awaited<ReturnType<typeof cookies>>): string | null {
  const authCookie = cookieStore.get('sb-olligknivxmnwecmyslx-auth-token')
  if (!authCookie) return null
  
  try {
    const value = authCookie.value
    const base64Part = value.replace('base64-', '')
    const decoded = JSON.parse(Buffer.from(base64Part, 'base64').toString())
    const accessToken = decoded.access_token
    if (!accessToken) return null
    
    const payload = accessToken.split('.')[1]
    const payloadJson = JSON.parse(Buffer.from(payload, 'base64').toString())
    return payloadJson.sub || null
  } catch {
    return null
  }
}

/** 등록된 문서 카테고리 목록 조회 */
async function getCategories(): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('documents')
    .select('category')
    .not('category', 'is', null)

  return [...new Set((data ?? []).map(d => d.category).filter((c): c is string => Boolean(c)))]
}

export default async function ChatPage() {
  const supabase = await createClient()
  const cookieStore = await cookies()

  // 인증 확인 (middleware에서도 보호하지만 서버 컴포넌트에서 이중 확인)
  const { data: { user }, error } = await supabase.auth.getUser()
  
  // JWT 쿠키에서 직접 user_id 추출 (fallback)
  const userIdFromCookie = getUserIdFromAuthCookie(cookieStore)
  
  const effectiveUser = user || (userIdFromCookie ? { id: userIdFromCookie } : null)
  
  if (!effectiveUser) {
    redirect('/auth/login?redirectTo=/chat')
  }

  const categories = await getCategories()

  return <ChatInterface initialCategories={categories} />
}
