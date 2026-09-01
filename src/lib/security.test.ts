import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sanitizeInput,
  sanitizeHTML,
  isValidEmail,
  isValidUUID,
  loginRateLimiter,
  securityHeaders,
} from './security';

// ── sanitizeInput ────────────────────────────────────────────────────

describe('sanitizeInput', () => {
  it('escapa caracteres XSS perigosos', () => {
    expect(sanitizeInput('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;',
    );
  });

  it('escapa & e aspas simples', () => {
    expect(sanitizeInput("a & b 'c'")).toBe('a &amp; b &#x27;c&#x27;');
  });

  it('retorna string vazia para input falsy', () => {
    expect(sanitizeInput('')).toBe('');
    expect(sanitizeInput(null as any)).toBe('');
    expect(sanitizeInput(undefined as any)).toBe('');
  });

  it('mantém texto limpo inalterado', () => {
    expect(sanitizeInput('Produto 123')).toBe('Produto 123');
  });
});

// ── sanitizeHTML ─────────────────────────────────────────────────────

describe('sanitizeHTML', () => {
  it('remove todas as tags HTML', () => {
    expect(sanitizeHTML('<b>negrito</b>')).toBe('negrito');
    expect(sanitizeHTML('<p>parágrafo</p>')).toBe('parágrafo');
  });

  it('remove tags com atributos', () => {
    expect(sanitizeHTML('<a href="http://evil.com">link</a>')).toBe('link');
  });

  it('retorna string vazia para input falsy', () => {
    expect(sanitizeHTML('')).toBe('');
    expect(sanitizeHTML(null as any)).toBe('');
  });

  it('mantém texto sem tags', () => {
    expect(sanitizeHTML('sem tags aqui')).toBe('sem tags aqui');
  });

  it('remove tags aninhadas', () => {
    expect(sanitizeHTML('<div><span><b>ok</b></span></div>')).toBe('ok');
  });
});

// ── isValidEmail ─────────────────────────────────────────────────────

describe('isValidEmail', () => {
  it('aceita emails válidos', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('a.b@c.com')).toBe(true);
    expect(isValidEmail('test+tag@domain.org')).toBe(true);
  });

  it('rejeita emails inválidos', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('noat')).toBe(false);
    expect(isValidEmail('@domain.com')).toBe(false);
    expect(isValidEmail('user@')).toBe(false);
    expect(isValidEmail('user @domain.com')).toBe(false);
  });
});

// ── isValidUUID ──────────────────────────────────────────────────────

describe('isValidUUID', () => {
  it('aceita UUIDs válidos (v1-v5)', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true); // v4
    expect(isValidUUID('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(true); // v4
    expect(isValidUUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')).toBe(true); // v1
  });

  it('rejeita strings que não são UUID', () => {
    expect(isValidUUID('')).toBe(false);
    expect(isValidUUID('not-a-uuid')).toBe(false);
    expect(isValidUUID('550e8400-e29b-41d4-a716')).toBe(false); // curto
    expect(isValidUUID('g47ac10b-58cc-4372-a567-0e02b2c3d479')).toBe(false); // 'g' inválido
  });
});

// ── loginRateLimiter ─────────────────────────────────────────────────

describe('loginRateLimiter', () => {
  beforeEach(() => {
    loginRateLimiter.reset('testuser@test.com');
  });

  it('permite tentativas iniciais', () => {
    expect(loginRateLimiter.canAttempt('testuser@test.com')).toBe(true);
    expect(loginRateLimiter.getRemainingAttempts('testuser@test.com')).toBe(5);
  });

  it('registra tentativas e decrementa restantes', () => {
    loginRateLimiter.recordAttempt('testuser@test.com');
    expect(loginRateLimiter.getRemainingAttempts('testuser@test.com')).toBe(4);

    loginRateLimiter.recordAttempt('testuser@test.com');
    expect(loginRateLimiter.getRemainingAttempts('testuser@test.com')).toBe(3);
  });

  it('bloqueia após 5 tentativas', () => {
    for (let i = 0; i < 5; i++) {
      loginRateLimiter.recordAttempt('lockuser@test.com');
    }
    expect(loginRateLimiter.canAttempt('lockuser@test.com')).toBe(false);
    expect(loginRateLimiter.getRemainingAttempts('lockuser@test.com')).toBe(0);
    expect(loginRateLimiter.getLockoutTimeRemaining('lockuser@test.com')).toBeGreaterThan(0);

    // Cleanup
    loginRateLimiter.reset('lockuser@test.com');
  });

  it('reset limpa o contador', () => {
    loginRateLimiter.recordAttempt('testuser@test.com');
    loginRateLimiter.recordAttempt('testuser@test.com');
    loginRateLimiter.reset('testuser@test.com');
    expect(loginRateLimiter.canAttempt('testuser@test.com')).toBe(true);
    expect(loginRateLimiter.getRemainingAttempts('testuser@test.com')).toBe(5);
  });

  it('getLockoutTimeRemaining retorna 0 para identifier sem tentativas', () => {
    expect(loginRateLimiter.getLockoutTimeRemaining('nobody@test.com')).toBe(0);
  });

  it('identificadores são isolados entre si', () => {
    loginRateLimiter.recordAttempt('user1@test.com');
    loginRateLimiter.recordAttempt('user1@test.com');
    // user2@test.com não foi afetado
    expect(loginRateLimiter.getRemainingAttempts('user2@test.com')).toBe(5);

    // Cleanup
    loginRateLimiter.reset('user1@test.com');
  });

  it('lockout expira após 15 minutos (simulado com Date.now mock)', () => {
    const now = Date.now();
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(now);

    for (let i = 0; i < 5; i++) {
      loginRateLimiter.recordAttempt('expiring@test.com');
    }
    expect(loginRateLimiter.canAttempt('expiring@test.com')).toBe(false);

    // Avança 15 minutos + 1ms
    dateSpy.mockReturnValue(now + 15 * 60 * 1000 + 1);
    expect(loginRateLimiter.canAttempt('expiring@test.com')).toBe(true);

    vi.restoreAllMocks();
    loginRateLimiter.reset('expiring@test.com');
  });
});

// ── securityHeaders ──────────────────────────────────────────────────

describe('securityHeaders', () => {
  it('contém os headers de segurança esperados', () => {
    expect(securityHeaders['X-Content-Type-Options']).toBe('nosniff');
    expect(securityHeaders['X-Frame-Options']).toBe('DENY');
    expect(securityHeaders['X-XSS-Protection']).toBe('1; mode=block');
    expect(securityHeaders['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(securityHeaders['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(securityHeaders['Content-Security-Policy']).toContain("default-src 'self'");
  });
});
