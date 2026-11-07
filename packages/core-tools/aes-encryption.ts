/**
 * AES-GCM 256-bit Authenticated Encryption & Decryption Engine
 * Implemented using the native, browser-secure Web Crypto API.
 */

import { bytesToBase64, base64ToBytes } from './base64-hex';

// OWASP Recommended baseline for PBKDF2-HMAC-SHA256 (600,000 iterations)
export const CURRENT_PBKDF2_ITERATIONS = 600000;
export const LEGACY_PBKDF2_ITERATIONS = 100000;

export const MIN_ITERATIONS = 210000; // Compatibility floor for existing v2 ciphertexts only
export const MAX_ITERATIONS = 5000000;

export const SALT_LENGTH = 16; // 16 bytes
export const IV_LENGTH = 12; // 12 bytes recommended for AES-GCM
export const VERSION_HEADER_MAGIC = new Uint8Array([0x44, 0x4f, 0x54, 0x02]); // "DOT\x02"
export const VERSION_HEADER_LENGTH = 8; // 4 bytes magic + 4 bytes iterations

/**
 * Derives a 256-bit AES-GCM CryptoKey from a user password using PBKDF2-SHA256.
 */
async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new Uint8Array(salt).buffer,
      iterations,
      hash: 'SHA-256'
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts plaintext string using AES-GCM 256-bit with PBKDF2 key derivation (600,000 iterations).
 * Returns a Base64 string containing versioned envelope:
 * [4B magic 'DOT\x02' + 4B iterations (uint32be) + 16B salt + 12B IV + ciphertext/tag].
 * The 8-byte header is authenticated via AES-GCM additionalData.
 */
export async function encryptAesGcm(
  plaintext: string,
  password: string,
  iterations = CURRENT_PBKDF2_ITERATIONS
): Promise<string> {
  if (!plaintext || !password) {
    return '';
  }

  if (!Number.isInteger(iterations) || iterations < CURRENT_PBKDF2_ITERATIONS || iterations > MAX_ITERATIONS) {
    throw new Error(`Iterations must be an integer between ${CURRENT_PBKDF2_ITERATIONS} and ${MAX_ITERATIONS}.`);
  }

  // Construct versioned envelope header [DOT\x02 + 4-byte iterations]
  const header = new Uint8Array(VERSION_HEADER_LENGTH);
  header.set(VERSION_HEADER_MAGIC, 0);
  new DataView(header.buffer).setUint32(4, iterations, false);

  const salt = new Uint8Array(SALT_LENGTH);
  crypto.getRandomValues(salt);

  const iv = new Uint8Array(IV_LENGTH);
  crypto.getRandomValues(iv);

  const key = await deriveKey(password, salt, iterations);
  const encodedText = new TextEncoder().encode(plaintext);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
      additionalData: header as unknown as BufferSource
    },
    key,
    encodedText
  );

  const ciphertext = new Uint8Array(ciphertextBuffer);

  // Combine [header (8)] + [salt (16)] + [iv (12)] + [ciphertext+tag (n)]
  const combined = new Uint8Array(VERSION_HEADER_LENGTH + salt.length + iv.length + ciphertext.length);
  combined.set(header, 0);
  combined.set(salt, VERSION_HEADER_LENGTH);
  combined.set(iv, VERSION_HEADER_LENGTH + salt.length);
  combined.set(ciphertext, VERSION_HEADER_LENGTH + salt.length + iv.length);

  // Mathematical Base64 encoding without native btoa
  return bytesToBase64(combined, false, true);
}

/**
 * Decrypts a Base64-encoded AES-GCM envelope using the supplied password.
 * Supports both v2 versioned envelopes (with authenticated header) and legacy unversioned envelopes (100k iterations).
 */
export async function decryptAesGcm(base64Payload: string, password: string, format: 'auto' | 'v2' | 'legacy' = 'auto'): Promise<string> {
  if (!base64Payload || !password) {
    return '';
  }

  // Mathematical Base64 decoding without native atob
  const combined = base64ToBytes(base64Payload.trim());
  if (!['auto', 'v2', 'legacy'].includes(format)) throw new Error('Unknown envelope format.');
  const hasMagicPrefix = combined[0] === 0x44 && combined[1] === 0x4f && combined[2] === 0x54;
  if (format !== 'legacy' && (hasMagicPrefix || format === 'v2')) {
    if (!hasMagicPrefix || combined[3] !== 2) throw new Error('Unsupported versioned envelope. Select legacy format only for known legacy data.');
    if (combined.length < VERSION_HEADER_LENGTH + SALT_LENGTH + IV_LENGTH + 16) throw new Error('Invalid payload: truncated v2 envelope.');
  }

  // Check if payload starts with v2 magic header "DOT\x02"
  const isV2 =
    format !== 'legacy' &&
    combined.length >= VERSION_HEADER_LENGTH + SALT_LENGTH + IV_LENGTH + 16 &&
    combined[0] === VERSION_HEADER_MAGIC[0] &&
    combined[1] === VERSION_HEADER_MAGIC[1] &&
    combined[2] === VERSION_HEADER_MAGIC[2] &&
    combined[3] === VERSION_HEADER_MAGIC[3];

  if (isV2) {
    try {
      const header = combined.slice(0, VERSION_HEADER_LENGTH);
      const iterations = new DataView(combined.buffer, combined.byteOffset, VERSION_HEADER_LENGTH).getUint32(4, false);
      if (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
        throw new Error(`Invalid iteration count in envelope header: ${iterations}.`);
      }

      const salt = combined.slice(VERSION_HEADER_LENGTH, VERSION_HEADER_LENGTH + SALT_LENGTH);
      const iv = combined.slice(VERSION_HEADER_LENGTH + SALT_LENGTH, VERSION_HEADER_LENGTH + SALT_LENGTH + IV_LENGTH);
      const ciphertext = combined.slice(VERSION_HEADER_LENGTH + SALT_LENGTH + IV_LENGTH);

      const key = await deriveKey(password, salt, iterations);
      
      const decryptParams: AesGcmParams = {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource,
        additionalData: header as unknown as BufferSource
      };

      const decryptedBuffer = await crypto.subtle.decrypt(
        decryptParams,
        key,
        ciphertext as unknown as BufferSource
      );

      return new TextDecoder().decode(decryptedBuffer);
    } catch (err) {
      if (err instanceof Error && err.message.includes('Invalid iteration count')) throw err;
      throw new Error('V2 Decryption failed: Incorrect password or corrupted/tampered data.');
    }
  }

  // Try Legacy
  if (combined.length >= SALT_LENGTH + IV_LENGTH + 16) {
    try {
      const iterations = LEGACY_PBKDF2_ITERATIONS;
      const salt = combined.slice(0, SALT_LENGTH);
      const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
      const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH);

      const key = await deriveKey(password, salt, iterations);
      
      const decryptParams: AesGcmParams = {
        name: 'AES-GCM',
        iv: iv as unknown as BufferSource
      };

      const decryptedBuffer = await crypto.subtle.decrypt(
        decryptParams,
        key,
        ciphertext as unknown as BufferSource
      );

      return new TextDecoder().decode(decryptedBuffer);
    } catch (err) {
      throw new Error('Decryption failed: Incorrect password or corrupted/tampered data.');
    }
  }

  throw new Error('Invalid payload: Data is too short to be a valid AES-GCM envelope.');
}

export interface DecomposedAesEnvelope {
  isValid: boolean;
  version: 'v2' | 'legacy' | 'invalid';
  iterations: number;
  saltHex: string;
  ivHex: string;
  tagHex: string;
  ciphertextLength: number;
  totalBytes: number;
  error?: string;
}

/**
 * Parses and decomposes a Base64-encoded AES-GCM envelope into its cryptographic components.
 */
export function parseAesEnvelope(base64Payload: string): DecomposedAesEnvelope {
  try {
    const raw = base64Payload ? base64Payload.trim() : '';
    if (!raw) {
      return { isValid: false, version: 'invalid', iterations: 0, saltHex: '', ivHex: '', tagHex: '', ciphertextLength: 0, totalBytes: 0, error: 'Empty payload' };
    }
    const bytes = base64ToBytes(raw);
    const toHex = (u: Uint8Array) => Array.from(u).map(b => b.toString(16).padStart(2, '0')).join('');

    const hasMagic = bytes.length >= 8 && bytes[0] === 0x44 && bytes[1] === 0x4f && bytes[2] === 0x54 && bytes[3] === 0x02;
    if (hasMagic) {
      if (bytes.length < VERSION_HEADER_LENGTH + SALT_LENGTH + IV_LENGTH + 16) {
        return { isValid: false, version: 'invalid', iterations: 0, saltHex: '', ivHex: '', tagHex: '', ciphertextLength: 0, totalBytes: bytes.length, error: 'Truncated v2 envelope' };
      }
      const iterations = new DataView(bytes.buffer, bytes.byteOffset, 8).getUint32(4, false);
      const salt = bytes.slice(VERSION_HEADER_LENGTH, VERSION_HEADER_LENGTH + SALT_LENGTH);
      const iv = bytes.slice(VERSION_HEADER_LENGTH + SALT_LENGTH, VERSION_HEADER_LENGTH + SALT_LENGTH + IV_LENGTH);
      const ciphertextAndTag = bytes.slice(VERSION_HEADER_LENGTH + SALT_LENGTH + IV_LENGTH);
      const tag = ciphertextAndTag.slice(ciphertextAndTag.length - 16);
      return {
        isValid: true,
        version: 'v2',
        iterations,
        saltHex: toHex(salt),
        ivHex: toHex(iv),
        tagHex: toHex(tag),
        ciphertextLength: ciphertextAndTag.length - 16,
        totalBytes: bytes.length
      };
    }

    if (bytes.length >= SALT_LENGTH + IV_LENGTH + 16) {
      const salt = bytes.slice(0, SALT_LENGTH);
      const iv = bytes.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
      const ciphertextAndTag = bytes.slice(SALT_LENGTH + IV_LENGTH);
      const tag = ciphertextAndTag.slice(ciphertextAndTag.length - 16);
      return {
        isValid: true,
        version: 'legacy',
        iterations: LEGACY_PBKDF2_ITERATIONS,
        saltHex: toHex(salt),
        ivHex: toHex(iv),
        tagHex: toHex(tag),
        ciphertextLength: ciphertextAndTag.length - 16,
        totalBytes: bytes.length
      };
    }

    return { isValid: false, version: 'invalid', iterations: 0, saltHex: '', ivHex: '', tagHex: '', ciphertextLength: 0, totalBytes: bytes.length, error: 'Payload too short' };
  } catch (err: any) {
    return { isValid: false, version: 'invalid', iterations: 0, saltHex: '', ivHex: '', tagHex: '', ciphertextLength: 0, totalBytes: 0, error: err.message };
  }
}

/**
 * Generates an end-to-end Python decryption script for the given AES-GCM envelope using the 'cryptography' library.
 */
export function generatePythonDecryptionScript(base64Payload: string, passwordPlaceholder = 'YOUR_SECRET_PASSWORD'): string {
  const parsed = parseAesEnvelope(base64Payload);
  const iterations = parsed.isValid ? parsed.iterations : CURRENT_PBKDF2_ITERATIONS;
  const isV2 = parsed.version === 'v2';
  const cleanPayload = base64Payload ? base64Payload.trim() : '';

  if (isV2) {
    return [
      '# Requirements: pip install cryptography',
      'import base64',
      'from cryptography.hazmat.primitives.ciphers.aead import AESGCM',
      'from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC',
      'from cryptography.hazmat.primitives import hashes',
      '',
      `PAYLOAD_B64 = "${cleanPayload}"`,
      `PASSWORD = "${passwordPlaceholder}"`,
      '',
      '# 1. Decode envelope bytes',
      'raw = base64.b64decode(PAYLOAD_B64)',
      'header = raw[:8]          # 4B "DOT\\x02" + 4B iterations uint32',
      'salt = raw[8:24]          # 16-byte random salt',
      'iv = raw[24:36]           # 12-byte random IV',
      'ciphertext = raw[36:]     # Encrypted data + 16-byte auth tag',
      '',
      '# 2. Derive 256-bit AES-GCM key via PBKDF2-HMAC-SHA256',
      'kdf = PBKDF2HMAC(',
      '    algorithm=hashes.SHA256(),',
      '    length=32,',
      '    salt=salt,',
      `    iterations=${iterations}`,
      ')',
      'key = kdf.derive(PASSWORD.encode("utf-8"))',
      '',
      '# 3. Decrypt with authenticated additionalData header',
      'aesgcm = AESGCM(key)',
      'plaintext = aesgcm.decrypt(iv, ciphertext, associated_data=header)',
      'print("Decrypted plaintext:", plaintext.decode("utf-8"))'
    ].join('\n');
  }

  return [
    '# Requirements: pip install cryptography',
    'import base64',
    'from cryptography.hazmat.primitives.ciphers.aead import AESGCM',
    'from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC',
    'from cryptography.hazmat.primitives import hashes',
    '',
    `PAYLOAD_B64 = "${cleanPayload}"`,
    `PASSWORD = "${passwordPlaceholder}"`,
    '',
    'raw = base64.b64decode(PAYLOAD_B64)',
    'salt = raw[:16]',
    'iv = raw[16:28]',
    'ciphertext = raw[28:]',
    '',
    'kdf = PBKDF2HMAC(',
    '    algorithm=hashes.SHA256(),',
    '    length=32,',
    '    salt=salt,',
    `    iterations=${iterations}`,
    ')',
    'key = kdf.derive(PASSWORD.encode("utf-8"))',
    'aesgcm = AESGCM(key)',
    'plaintext = aesgcm.decrypt(iv, ciphertext, associated_data=None)',
    'print("Decrypted plaintext:", plaintext.decode("utf-8"))'
  ].join('\n');
}

/**
 * Generates an end-to-end Node.js decryption script for the given AES-GCM envelope using the native 'crypto' module.
 */
export function generateNodeDecryptionScript(base64Payload: string, passwordPlaceholder = 'YOUR_SECRET_PASSWORD'): string {
  const parsed = parseAesEnvelope(base64Payload);
  const iterations = parsed.isValid ? parsed.iterations : CURRENT_PBKDF2_ITERATIONS;
  const isV2 = parsed.version === 'v2';
  const cleanPayload = base64Payload ? base64Payload.trim() : '';

  if (isV2) {
    return [
      "// Node.js Built-in 'crypto' module (Zero External Dependencies)",
      "const crypto = require('crypto');",
      "",
      `const PAYLOAD_B64 = '${cleanPayload}';`,
      `const PASSWORD = '${passwordPlaceholder}';`,
      "",
      "const raw = Buffer.from(PAYLOAD_B64, 'base64');",
      "const header = raw.subarray(0, 8);",
      "const salt = raw.subarray(8, 24);",
      "const iv = raw.subarray(24, 36);",
      "const ciphertextAndTag = raw.subarray(36);",
      "",
      "// Last 16 bytes are the GCM authentication tag",
      "const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);",
      "const authTag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);",
      "",
      `// Derive 32-byte key via PBKDF2-SHA256 (${iterations.toLocaleString()} iterations)`,
      `const key = crypto.pbkdf2Sync(PASSWORD, salt, ${iterations}, 32, 'sha256');`,
      "",
      "// Decrypt with AES-256-GCM and authenticated additional data",
      "const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);",
      "decipher.setAAD(header);",
      "decipher.setAuthTag(authTag);",
      "",
      "const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);",
      "console.log('Decrypted plaintext:', decrypted.toString('utf8'));"
    ].join('\n');
  }

  return [
    "// Node.js Built-in 'crypto' module (Zero External Dependencies)",
    "const crypto = require('crypto');",
    "",
    `const PAYLOAD_B64 = '${cleanPayload}';`,
    `const PASSWORD = '${passwordPlaceholder}';`,
    "",
    "const raw = Buffer.from(PAYLOAD_B64, 'base64');",
    "const salt = raw.subarray(0, 16);",
    "const iv = raw.subarray(16, 28);",
    "const ciphertextAndTag = raw.subarray(28);",
    "",
    "const ciphertext = ciphertextAndTag.subarray(0, ciphertextAndTag.length - 16);",
    "const authTag = ciphertextAndTag.subarray(ciphertextAndTag.length - 16);",
    "",
    `const key = crypto.pbkdf2Sync(PASSWORD, salt, ${iterations}, 32, 'sha256');`,
    "",
    "const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);",
    "decipher.setAuthTag(authTag);",
    "",
    "const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);",
    "console.log('Decrypted plaintext:', decrypted.toString('utf8'));"
  ].join('\n');
}
