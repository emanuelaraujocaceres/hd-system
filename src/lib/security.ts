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
 * Rate limiter for login attempts
 */
class RateLimiter {
  private attempts: Map<string, { count: number; lastAttempt: number }> = new Map();
  private readonly maxAttempts = 5;
  private readonly lockoutDuration = 15 * 60 * 1000; // 15 minutes

  canAttempt(identifier: string): boolean {
    const record = this.attempts.get(identifier);
    
    if (!record) {
      return true;
    }

    // Reset if lockout duration has passed
    if (Date.now() - record.lastAttempt > this.lockoutDuration) {
      this.attempts.delete(identifier);
      return true;
    }

    return record.count < this.maxAttempts;
  }

  recordAttempt(identifier: string): void {
    const record = this.attempts.get(identifier);
    
    if (record) {
      record.count++;
      record.lastAttempt = Date.now();
    } else {
      this.attempts.set(identifier, { count: 1, lastAttempt: Date.now() });
    }
  }

  getRemainingAttempts(identifier: string): number {
    const record = this.attempts.get(identifier);
    
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
    const record = this.attempts.get(identifier);
    
    if (!record) {
      return 0;
    }

    const remaining = this.lockoutDuration - (Date.now() - record.lastAttempt);
    return Math.max(0, remaining);
  }

  reset(identifier: string): void {
    this.attempts.delete(identifier);
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
