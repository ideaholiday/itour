import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jidknptoyloucgldaool.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_WwdMLSfWZE8fErjAKcs6UQ_tIBSHZcA',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: Avoid writing logic between createServerClient and getUser().
  // getUser() sends a request to the Supabase Auth server to revalidate the token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const url = request.nextUrl.clone();
  const pathname = url.pathname;

  // Protected route checking
  if (user) {
    const role = user.user_metadata?.role || 'user';

    // Prevent logged in users from visiting auth pages (/login, /signup)
    if (pathname === '/login' || pathname === '/signup') {
      if (role === 'supplier') {
        url.pathname = '/supplier/dashboard';
      } else if (role === 'admin') {
        url.pathname = '/admin/dashboard';
      } else {
        url.pathname = '/account/bookings';
      }
      return NextResponse.redirect(url);
    }
  } else {
    // Unauthenticated access protection for protected route prefixes
    if (
      pathname.startsWith('/account') ||
      pathname.startsWith('/supplier') ||
      pathname.startsWith('/admin')
    ) {
      url.pathname = '/login';
      url.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
