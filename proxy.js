import { auth } from "@/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isAuthRoute = req.nextUrl.pathname.startsWith('/login');
  const isApiAuthRoute = req.nextUrl.pathname.startsWith('/api/auth');

  if (isApiAuthRoute) return null;

  if (!isLoggedIn && !isAuthRoute) {
    return Response.redirect(new URL('/login', req.nextUrl));
  }

  if (isLoggedIn && isAuthRoute) {
    return Response.redirect(new URL('/dashboard', req.nextUrl));
  }
  
  if (isLoggedIn && req.nextUrl.pathname === '/') {
    return Response.redirect(new URL('/dashboard', req.nextUrl));
  }

  return null;
});

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
