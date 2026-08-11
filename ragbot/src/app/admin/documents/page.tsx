import { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminDocumentsPage } from './AdminDocumentsClient'

export const metadata: Metadata = {
  title: '문서 관리 - 관리자',
  description: '문서 업로드 및 관리',
}

async function getUserRole() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  return profile?.role
}

export default async function AdminDocumentsPageServer() {
  const role = await getUserRole()
  
  if (role !== 'admin') {
    redirect('/chat')
  }

  return <AdminDocumentsPage />
}