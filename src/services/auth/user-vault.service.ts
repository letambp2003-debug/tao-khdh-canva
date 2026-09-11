import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SignJWT, jwtVerify } from 'jose';
import { getEnv } from '@/config/env';

export interface UserProfile {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  role: 'TEACHER' | 'ADMIN';
  encryptedKeys?: string;
  keyCount?: number;
  createdAt: string;
  lastLoginAt: string;
}

export class UserVaultService {
  private static readonly DATA_DIR = path.join(process.cwd(), 'data', 'users');

  private static ensureDir() {
    if (!fs.existsSync(this.DATA_DIR)) {
      fs.mkdirSync(this.DATA_DIR, { recursive: true });
    }
  }

  private static getEncryptionKey(): Buffer {
    const env = getEnv();
    const secret = env.AUTH_SECRET || 'khdh-auto-default-secret-key-32-chars-minimum';
    return crypto.createHash('sha256').update(secret).digest();
  }

  public static encrypt(text: string): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
  }

  public static decrypt(cipherText: string): string {
    try {
      const key = this.getEncryptionKey();
      const parts = cipherText.split(':');
      if (parts.length !== 2) return '';
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      return '';
    }
  }

  private static getUserFilePath(email: string): string {
    this.ensureDir();
    const safeEmail = email.toLowerCase().trim().replace(/[^a-z0-9@._-]/g, '_');
    return path.join(this.DATA_DIR, `${safeEmail}.json`);
  }

  public static getUserByEmail(email: string): UserProfile | null {
    try {
      const filePath = this.getUserFilePath(email);
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  public static saveUser(user: UserProfile): void {
    this.ensureDir();
    const filePath = this.getUserFilePath(user.email);
    fs.writeFileSync(filePath, JSON.stringify(user, null, 2), 'utf8');
  }

  public static findOrCreateGoogleUser(profile: {
    googleId: string;
    email: string;
    name: string;
    picture?: string;
  }): { user: UserProfile; isFirstTime: boolean } {
    const existing = this.getUserByEmail(profile.email);
    const now = new Date().toISOString();

    if (existing) {
      existing.lastLoginAt = now;
      if (profile.name) existing.name = profile.name;
      if (profile.picture) existing.picture = profile.picture;
      if (profile.googleId) existing.googleId = profile.googleId;
      this.saveUser(existing);
      const keys = this.getUserDecryptedKeys(existing.email);
      return {
        user: { ...existing, keyCount: keys.length },
        isFirstTime: keys.length === 0,
      };
    }

    const newUser: UserProfile = {
      googleId: profile.googleId,
      email: profile.email.toLowerCase().trim(),
      name: profile.name || profile.email.split('@')[0],
      picture: profile.picture || '',
      role: 'TEACHER',
      encryptedKeys: '',
      keyCount: 0,
      createdAt: now,
      lastLoginAt: now,
    };

    this.saveUser(newUser);
    return { user: newUser, isFirstTime: true };
  }

  public static saveUserKeys(email: string, keys: string[]): boolean {
    const user = this.getUserByEmail(email);
    if (!user) return false;

    const cleanKeys = Array.from(
      new Set(
        keys
          .map((k) => k.trim())
          .filter((k) => k.length > 10 && !k.includes('...') && !k.includes('***'))
      )
    );

    if (cleanKeys.length === 0) {
      user.encryptedKeys = '';
      user.keyCount = 0;
    } else {
      user.encryptedKeys = this.encrypt(JSON.stringify(cleanKeys));
      user.keyCount = cleanKeys.length;
    }

    this.saveUser(user);
    return true;
  }

  public static getUserDecryptedKeys(email: string): string[] {
    const user = this.getUserByEmail(email);
    if (!user || !user.encryptedKeys) return [];

    const decrypted = this.decrypt(user.encryptedKeys);
    if (!decrypted) return [];

    try {
      const parsed = JSON.parse(decrypted);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  public static async createSessionToken(user: UserProfile): Promise<string> {
    const env = getEnv();
    const secret = new TextEncoder().encode(env.AUTH_SECRET);
    return new SignJWT({
      email: user.email,
      name: user.name,
      picture: user.picture,
      googleId: user.googleId,
      role: user.role,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(user.email)
      .setIssuedAt()
      .setExpirationTime(`${env.SESSION_MAX_AGE_HOURS * 7}h`)
      .sign(secret);
  }

  public static async verifySessionToken(token: string): Promise<UserProfile | null> {
    try {
      const env = getEnv();
      const secret = new TextEncoder().encode(env.AUTH_SECRET);
      const { payload } = await jwtVerify(token, secret);
      const email = payload.email as string;
      if (!email) return null;
      return this.getUserByEmail(email);
    } catch {
      return null;
    }
  }

  public static async verifyGoogleIdToken(idToken: string): Promise<{
    success: boolean;
    profile?: { googleId: string; email: string; name: string; picture?: string };
    error?: string;
  }> {
    try {
      const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
      if (!res.ok) {
        return { success: false, error: 'Google ID token không hợp lệ hoặc đã hết hạn.' };
      }
      const data = await res.json();
      if (!data.email) {
        return { success: false, error: 'Không tìm thấy địa chỉ email trong Google token.' };
      }
      return {
        success: true,
        profile: {
          googleId: data.sub || data.user_id || '',
          email: data.email,
          name: data.name || data.email.split('@')[0],
          picture: data.picture || '',
        },
      };
    } catch (err) {
      return { success: false, error: 'Không thể kết nối đến Google OAuth API: ' + String(err) };
    }
  }
}
