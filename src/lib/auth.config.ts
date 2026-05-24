import type { NextAuthConfig } from 'next-auth'

// Lightweight config used by middleware (edge-compatible — no Prisma/pg)
export const authConfig: NextAuthConfig = {
  providers: [],
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user
      const isPublic =
        request.nextUrl.pathname.startsWith('/login') ||
        request.nextUrl.pathname.startsWith('/api/auth') ||
        request.nextUrl.pathname.startsWith('/api/whatsapp') ||
        request.nextUrl.pathname.startsWith('/api/year-grid')

      if (isPublic) return true
      return isLoggedIn
    },
  },
}
