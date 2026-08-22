import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const roleQuery = searchParams.get('role'); // e.g. from Google OAuth init
  const next = searchParams.get('next') || searchParams.get('redirectTo');

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jidknptoyloucgldaool.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_WwdMLSfWZE8fErjAKcs6UQ_tIBSHZcA',
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // The `setAll` method was called from a Server Component.
            }
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data?.session) {
      const user = data.session.user;
      
      // Determine effective user role
      // 1. From existing user_metadata.role
      // 2. From query param role (if user newly registered via OAuth)
      // 3. Default to 'user'
      let effectiveRole = user.user_metadata?.role;
      
      if (!effectiveRole && roleQuery) {
        effectiveRole = roleQuery === 'supplier' ? 'supplier' : 'user';
        
        // Update user_metadata with the assigned role
        await supabase.auth.updateUser({
          data: { role: effectiveRole },
        });
      }

      effectiveRole = effectiveRole || 'user';

      // Explicit target redirect if next/redirectTo param was provided
      if (next && next.startsWith('/') && !next.startsWith('//')) {
        return NextResponse.redirect(`${origin}${next}`);
      }

      // Dynamic server-side redirect based on user role
      if (effectiveRole === 'supplier') {
        return NextResponse.redirect(`${origin}/supplier/dashboard`);
      } else if (effectiveRole === 'admin') {
        return NextResponse.redirect(`${origin}/admin/dashboard`);
      } else if (effectiveRole === 'ops') {
        return NextResponse.redirect(`${origin}/ops/dashboard`);
      } else {
        return NextResponse.redirect(`${origin}/account/bookings`);
      }
    }
  }

  // Return to login with error query param if exchange fails
  return NextResponse.redirect(`${origin}/login?error=Could%20not%20verify%20authentication%20code`);
}
