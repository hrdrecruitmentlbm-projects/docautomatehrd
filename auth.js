import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

async function refreshAccessToken(token) {
  try {
    const url = 'https://oauth2.googleapis.com/token';
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.AUTH_GOOGLE_ID,
        client_secret: process.env.AUTH_GOOGLE_SECRET,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }),
    });
    const refreshed = await response.json();
    if (!response.ok) throw refreshed;
    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    };
  } catch (error) {
    console.error('Error refreshing access token:', error);
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET || "development-secret-for-docautomatehrd-session-encryption-32chars",
  trustHost: true,
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          scope: "openid email profile https://www.googleapis.com/auth/documents https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets.readonly"
        }
      }
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Login pertama: simpan token & hapus error lama.
      if (account) {
        return {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: Date.now() + account.expires_in * 1000,
          error: undefined,
        };
      }
      // Refresh sudah pernah gagal -> JANGAN coba lagi di setiap request.
      // Sebelumnya setiap auth() memanggil Google ulang dengan refresh token
      // yang sudah mati (cookie tidak bisa diperbarui dari route handler),
      // sehingga log Vercel dibanjiri "invalid_grant". Cukup login ulang.
      if (token.error) {
        return token;
      }
      // Tidak ada refresh token sama sekali -> tidak mungkin diperbarui.
      if (!token.refreshToken) {
        return { ...token, error: 'RefreshAccessTokenError' };
      }
      // Token masih valid (buffer 60 detik)
      if (Date.now() < token.accessTokenExpires - 60 * 1000) {
        return token;
      }
      // Token kedaluwarsa -> refresh
      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    },
  },
  pages: {
    signIn: '/login',
  },
});
