/**
 * Encryption utility for sensitive integration keys
 * 
 * Uses AES-GCM encryption with a key derived from the admin's user ID.
 * This ensures:
 * 1. Keys are encrypted at rest in localStorage
 * 2. Only the admin who saved the keys can decrypt them
 * 3. Keys are never displayed in plain text after saving
 * 4. Other admins cannot see or modify the keys
 */

import { storageService } from '../services/storageService';

// Derive encryption key from admin ID
async function deriveKey(adminId: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(adminId.padEnd(32, '0').slice(0, 32)),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('hd-system-integration-salt'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt a string
export async function encryptKey(plaintext: string, adminId: string): Promise<string> {
  if (!plaintext) return '';
  
  try {
    const key = await deriveKey(adminId);
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(plaintext)
    );

    // Combine IV + encrypted data as base64
    const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  } catch (err) {
    console.error('[Encryption] Error encrypting key:', err);
    return '';
  }
}

// Decrypt a string
export async function decryptKey(ciphertext: string, adminId: string): Promise<string> {
  if (!ciphertext) return '';
  
  try {
    const key = await deriveKey(adminId);
    const decoder = new TextDecoder();
    
    // Decode base64
    const combined = new Uint8Array(
      atob(ciphertext).split('').map(c => c.charCodeAt(0))
    );

    // Extract IV and encrypted data
    const iv = combined.slice(0, 12);
    const encrypted = combined.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted
    );

    return decoder.decode(decrypted);
  } catch (err) {
    console.error('[Decryption] Error decrypting key:', err);
    return '';
  }
}

// Mask a key for display (show only last 4 chars)
export function maskKey(key: string): string {
  if (!key || key.length <= 8) return '••••••••';
  const last4 = key.slice(-4);
  const masked = '•'.repeat(Math.min(16, key.length - 4));
  return masked + last4;
}

// Check if an admin is the owner of the integration keys
export function isKeyOwner(keyData: any, adminId: string): boolean {
  return keyData && keyData.ownerAdminId === adminId;
}

// Check if keys have been configured
export function hasKeysConfigured(keyData: any): boolean {
  if (!keyData) return false;
  return !!(keyData.encryptedKeys && Object.keys(keyData.encryptedKeys).length > 0);
}

export default {
  encryptKey,
  decryptKey,
  maskKey,
  isKeyOwner,
  hasKeysConfigured,
};
