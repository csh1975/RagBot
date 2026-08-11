import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { ChatInterface } from '@/components/chat/ChatInterface'

export const metadata: Metadata = {
  title: '챗봇 - RagBot',
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

  // 인증 확인 (middleware에서도 보호하지만 서버 컴포넌트에서 이중 확인)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/auth/login?redirectTo=/chat')
  }

  const categories = await getCategories()

  return <ChatInterface initialCategories={categories} />
}
