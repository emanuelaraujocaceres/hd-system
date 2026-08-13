/**
 * Security utilities for XSS prevention and input sanitization
 */

/**
 * Sanitize user input to prevent XSS attacks
 */
export function sanitizeInput(input: string): string {
  if (!input) return '';
  
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * Sanitize HTML content - removes all HTML tags
 */
export function sanitizeHTML(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate UUID format
 */
export function isValidUUID(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Rate limiter for login attempts — persistido em localStorage
 * para sobreviver a refreshes de página e tentativas de brute force.
 */
class RateLimiter {
  private readonly STORAGE_KEY = 'hd_system_rate_limiter';
  private readonly maxAttempts = 5;
  private readonly lockoutDuration = 15 * 60 * 1000; // 15 minutes

  private loadAttempts(): Map<string, { count: number; lastAttempt: number }> {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return new Map();
      const parsed = JSON.parse(raw);
      return new Map(Object.entries(parsed));
    } catch {
      return new Map();
    }
  }

  private saveAttempts(attempts: Map<string, { count: number; lastAttempt: number }>): void {
    try {
      const obj = Object.fromEntries(attempts);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // Quota exceeded or other localStorage error — fail silently
    }
  }

  canAttempt(identifier: string): boolean {
    const attempts = this.loadAttempts();
    const record = attempts.get(identifier);
    
    if (!record) {
      return true;
    }

    // Reset if lockout duration has passed
    if (Date.now() - record.lastAttempt > this.lockoutDuration) {
      attempts.delete(identifier);
      this.saveAttempts(attempts);
      return true;
    }

    return record.count < this.maxAttempts;
  }

  recordAttempt(identifier: string): void {
    const attempts = this.loadAttempts();
    const record = attempts.get(identifier);
    
    if (record) {
      record.count++;
      record.lastAttempt = Date.now();
    } else {
      attempts.set(identifier, { count: 1, lastAttempt: Date.now() });
    }
    this.saveAttempts(attempts);
  }

  getRemainingAttempts(identifier: string): number {
    const attempts = this.loadAttempts();
    const record = attempts.get(identifier);
    
    if (!record) {
      return this.maxAttempts;
    }

    // Reset if lockout duration has passed
    if (Date.now() - record.lastAttempt > this.lockoutDuration) {
      return this.maxAttempts;
    }

    return Math.max(0, this.maxAttempts - record.count);
  }

  getLockoutTimeRemaining(identifier: string): number {
    const attempts = this.loadAttempts();
    const record = attempts.get(identifier);
    
    if (!record) {
      return 0;
    }

    const remaining = this.lockoutDuration - (Date.now() - record.lastAttempt);
    return Math.max(0, remaining);
  }

  reset(identifier: string): void {
    const attempts = this.loadAttempts();
    attempts.delete(identifier);
    this.saveAttempts(attempts);
  }
}

export const loginRateLimiter = new RateLimiter();

/**
 * Security headers helper
 */
export const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' https:; connect-src 'self' https://*.supabase.co https://api.qrserver.com;",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export default {
  sanitizeInput,
  sanitizeHTML,
  isValidEmail,
  isValidUUID,
  loginRateLimiter,
  securityHeaders,
};
