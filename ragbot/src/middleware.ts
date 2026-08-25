import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// JWT에서 user_id 추출 (base64- prefix 제거 후 디코딩)
function getUserIdFromAuthCookie(request: NextRequest): string | null {
  const authCookie = request.cookies.get('sb-olligknivxmnwecmyslx-auth-token')
  if (!authCookie) return null
  
  try {
    const value = authCookie.value
    const base64Part = value.replace('base64-', '')
    const decoded = JSON.parse(Buffer.from(base64Part, 'base64').toString())
    const accessToken = decoded.access_token
    if (!accessToken) return null
    
    // JWT payload 디코딩 (header.payload.signature 중 payload 부분)
    const payload = accessToken.split('.')[1]
    const payloadJson = JSON.parse(Buffer.from(payload, 'base64').toString())
    return payloadJson.sub || null
  } catch {
    return null
  }
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // JWT 쿠키에서 user_id 직접 추출 (Supabase getUser() 네트워크 이슈 우회)
  const userId = getUserIdFromAuthCookie(request)
  
  // Supabase 클라이언트로도 시도 (정상 작동 시 우선)
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  const effectiveUserId = user?.id || userId
  const effectiveUser = user || (userId ? { id: userId } : null)

  console.log('[Middleware] Path:', request.nextUrl.pathname, 'User:', effectiveUserId || 'null', 'SupabaseError:', error?.message)

  const path = request.nextUrl.pathname

  // 보호된 경로: 관리자 페이지
  const isAdminPath = path.startsWith('/admin')
  
  // 보호된 경로: 챗봇 (인증 필요)
  const isChatPath = path.startsWith('/chat')

  // 로그인/회원가입 페이지
  const isAuthPath = path.startsWith('/auth/login') || path.startsWith('/auth/signup')

  // 인증되지 않은 사용자가 보호된 경로에 접근 시 로그인 페이지로 리다이렉트
  if ((isAdminPath || isChatPath) && !effectiveUser) {
    const loginUrl = new URL('/auth/login', request.url)
    loginUrl.searchParams.set('redirectTo', path)
    return NextResponse.redirect(loginUrl)
  }

  // 관리자 페이지 접근 시 역할 확인
  if (isAdminPath && effectiveUser) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', effectiveUser.id)
      .single()

    if (profile?.role !== 'admin') {
      // 관리자가 아니면 챗봇 페이지로 리다이렉트
      return NextResponse.redirect(new URL('/chat', request.url))
    }
  }

  // 이미 로그인한 사용자가 로그인/회원가입 페이지 접근 시 리다이렉트
  if (isAuthPath && effectiveUser) {
    const redirectTo = request.nextUrl.searchParams.get('redirectTo') || '/chat'
    return NextResponse.redirect(new URL(redirectTo, request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}