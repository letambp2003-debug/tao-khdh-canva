import { NextRequest, NextResponse } from 'next/server';
import { UserVaultService } from '@/services/auth/user-vault.service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { credential, email, name, picture, googleId } = body;

    let userProfile: { googleId: string; email: string; name: string; picture?: string };

    if (credential && typeof credential === 'string') {
      const verifyResult = await UserVaultService.verifyGoogleIdToken(credential);
      if (!verifyResult.success || !verifyResult.profile) {
        return NextResponse.json(
          { error: 'INVALID_CREDENTIAL', message: verifyResult.error || 'Token Google không hợp lệ.' },
          { status: 401 }
        );
      }
      userProfile = verifyResult.profile;
    } else if (email && typeof email === 'string' && email.includes('@')) {
      userProfile = {
        googleId: googleId || `google_${Date.now()}`,
        email: email.trim().toLowerCase(),
        name: name || email.split('@')[0],
        picture: picture || '',
      };
    } else {
      return NextResponse.json(
        { error: 'MISSING_DATA', message: 'Vui lòng cung cấp Google credential hoặc Email hợp lệ.' },
        { status: 400 }
      );
    }

    const { user, isFirstTime } = UserVaultService.findOrCreateGoogleUser(userProfile);
    const sessionToken = await UserVaultService.createSessionToken(user);
    const decryptedKeys = UserVaultService.getUserDecryptedKeys(user.email);

    const response = NextResponse.json({
      success: true,
      isFirstTime,
      user: {
        email: user.email,
        name: user.name,
        picture: user.picture,
        role: user.role,
        hasConfiguredKeys: decryptedKeys.length > 0,
        keyCount: decryptedKeys.length,
      },
    });

    // Set secure HttpOnly cookie
    response.cookies.set({
      name: 'khdh_auth_token',
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error) {
    console.error('Auth Google error:', error);
    return NextResponse.json(
      { error: 'AUTH_FAILED', message: 'Đăng nhập Google thất bại: ' + String(error) },
      { status: 500 }
    );
  }
}
