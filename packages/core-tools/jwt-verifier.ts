/**
 * DevOmniTools — Offline JWT Signature Verifier & RSA/HMAC Debugger Engine
 * 100% Client-Side Web Crypto API implementation.
 * Zero data transmission; keys and payloads remain exclusively in memory.
 */

import { base64ToBytes, bytesToText } from './base64-hex';

export interface JwkKey {
  kty: 'RSA' | 'EC' | 'oct' | string;
  kid?: string;
  use?: 'sig' | 'enc' | string;
  alg?: string;
  n?: string;
  e?: string;
  crv?: 'P-256' | 'P-384' | 'P-521' | string;
  x?: string;
  y?: string;
  [key: string]: any;
}

export interface JwksDocument {
  keys: JwkKey[];
}

export interface DecodedJwt {
  validFormat: boolean;
  rawHeader?: string;
  rawPayload?: string;
  rawSignature?: string;
  header?: Record<string, any>;
  payload?: Record<string, any>;
  error?: string;
}

export interface JwtVerificationResult {
  isValid: boolean;
  signatureValid: boolean;
  claimsValid: boolean;
  policyEvaluated: boolean;
  signatureStatus: 'VALID' | 'INVALID' | 'UNCHECKED' | 'ERROR';
  algorithm?: string;
  isExpired: boolean;
  expirationDate?: string;
  issuedAtDate?: string;
  notBeforeDate?: string;
  decoded?: DecodedJwt;
  message?: string;
  warnings: string[];
}

export interface VerifyOptions {
  token: string;
  secretOrKey?: string;
  expectedAlg?: string;
  expectedIss?: string;
  expectedAud?: string;
  clockTolerance?: number; // in seconds
}

/**
 * Decodes Base64Url string to regular UTF-8 string
 */
export function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  } else {
    // Node.js fallback
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
}

/**
 * Decodes Base64Url string directly to Uint8Array buffer
 */
export function base64UrlToBuffer(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } else {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
}

/**
 * Splits and decodes a JWT token into Header, Payload, and Signature segments
 */
export function decodeJwtParts(token: string): DecodedJwt {
  if (!token || typeof token !== 'string') {
    return { validFormat: false, error: 'Token must be a non-empty string' };
  }

  const parts = token.trim().split('.');
  if (parts.length !== 3) {
    return {
      validFormat: false,
      error: `Invalid JWT format: expected 3 segments separated by dots, found ${parts.length}`
    };
  }

  const [rawHeader, rawPayload, rawSignature] = parts;

  try {
    if (!/^[A-Za-z0-9_-]+$/.test(rawHeader) || !/^[A-Za-z0-9_-]+$/.test(rawPayload) || !/^[A-Za-z0-9_-]*$/.test(rawSignature)) {
      throw new Error('JWT segments require the unpadded Base64URL alphabet');
    }
    const headerJson = bytesToText(base64ToBytes(rawHeader, { urlSafe: true }));
    const header = JSON.parse(headerJson);

    const payloadJson = bytesToText(base64ToBytes(rawPayload, { urlSafe: true }));
    const payload = JSON.parse(payloadJson);
    if (!header || typeof header !== 'object' || Array.isArray(header) || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('JWT header and claims must be JSON objects');
    }
    if (typeof header.alg !== 'string') throw new Error('JWT algorithm must be a string');

    return {
      validFormat: true,
      rawHeader,
      rawPayload,
      rawSignature,
      header,
      payload
    };
  } catch (err: any) {
    return {
      validFormat: false,
      error: `Failed to decode JWT segments as JSON: ${err?.message || 'Invalid base64url encoding'}`
    };
  }
}

/**
 * Parse PEM format Public Key to ArrayBuffer (SPKI)
 */
function pemToArrayBuffer(pem: string): Uint8Array {
  const cleanPem = pem
    .replace(/-----BEGIN[ A-Z0-9_-]+-----/g, '')
    .replace(/-----END[ A-Z0-9_-]+-----/g, '')
    .replace(/\s+/g, '');
  return base64UrlToBuffer(cleanPem);
}

/**
 * Verifies an HMAC signature (HS256, HS384, HS512)
 */
export async function verifyHmacJwt(
  dataToSign: string,
  rawSignature: string,
  secret: string,
  algorithm: 'HS256' | 'HS384' | 'HS512'
): Promise<boolean> {
  const enc = new TextEncoder();
  const hash = algorithm === 'HS256' ? 'SHA-256' : algorithm === 'HS384' ? 'SHA-384' : 'SHA-512';

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: { name: hash } },
    false,
    ['verify']
  );

  const sigBuffer = base64UrlToBuffer(rawSignature);
  const dataBuffer = enc.encode(dataToSign);

  return await crypto.subtle.verify('HMAC', key, new Uint8Array(sigBuffer).buffer, dataBuffer);
}

/**
 * Verifies an RSA signature (RS256, RS384, RS512)
 */
function cleanJwkForImport(jwk: JwkKey): JsonWebKey {
  const clean: any = {
    kty: jwk.kty,
  };
  if (jwk.kty === 'RSA') {
    clean.n = jwk.n;
    clean.e = jwk.e;
  } else if (jwk.kty === 'EC') {
    clean.crv = jwk.crv;
    clean.x = jwk.x;
    clean.y = jwk.y;
  }
  return clean;
}

export async function verifyRsaJwt(
  dataToSign: string,
  rawSignature: string,
  keyOrJwk: string | JwkKey,
  algorithm: 'RS256' | 'RS384' | 'RS512'
): Promise<boolean> {
  const enc = new TextEncoder();
  const hash = algorithm === 'RS256' ? 'SHA-256' : algorithm === 'RS384' ? 'SHA-384' : 'SHA-512';

  let key: CryptoKey;
  if (typeof keyOrJwk === 'object' && keyOrJwk.kty === 'RSA') {
    key = await crypto.subtle.importKey(
      'jwk',
      cleanJwkForImport(keyOrJwk),
      { name: 'RSASSA-PKCS1-v1_5', hash: { name: hash } },
      false,
      ['verify']
    );
  } else if (typeof keyOrJwk === 'string' && keyOrJwk.trim().startsWith('{')) {
    let parsed: any;
    try {
      parsed = JSON.parse(keyOrJwk.trim());
    } catch {
      throw new Error('Invalid JWK JSON format');
    }
    key = await crypto.subtle.importKey(
      'jwk',
      cleanJwkForImport(parsed),
      { name: 'RSASSA-PKCS1-v1_5', hash: { name: hash } },
      false,
      ['verify']
    );
  } else {
    const spkiBuffer = pemToArrayBuffer(keyOrJwk as string);
    key = await crypto.subtle.importKey(
      'spki',
      new Uint8Array(spkiBuffer).buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: { name: hash } },
      false,
      ['verify']
    );
  }

  const sigBuffer = base64UrlToBuffer(rawSignature);
  const dataBuffer = enc.encode(dataToSign);

  return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, new Uint8Array(sigBuffer).buffer, dataBuffer);
}

/**
 * Verifies an ECDSA signature (ES256, ES384, ES512)
 */
export async function verifyEcdsaJwt(
  dataToSign: string,
  rawSignature: string,
  keyOrJwk: string | JwkKey,
  algorithm: 'ES256' | 'ES384' | 'ES512'
): Promise<boolean> {
  const enc = new TextEncoder();
  const hash = algorithm === 'ES256' ? 'SHA-256' : algorithm === 'ES384' ? 'SHA-384' : 'SHA-512';
  const namedCurve = algorithm === 'ES256' ? 'P-256' : algorithm === 'ES384' ? 'P-384' : 'P-521';

  let cryptoKey: CryptoKey;
  if (typeof keyOrJwk === 'object' && keyOrJwk.kty === 'EC') {
    cryptoKey = await crypto.subtle.importKey(
      'jwk',
      cleanJwkForImport(keyOrJwk),
      { name: 'ECDSA', namedCurve: keyOrJwk.crv || namedCurve },
      false,
      ['verify']
    );
  } else if (typeof keyOrJwk === 'string' && keyOrJwk.trim().startsWith('{')) {
    let parsedJwk: any;
    try {
      parsedJwk = JSON.parse(keyOrJwk.trim());
    } catch {
      throw new Error('Invalid JWK JSON format');
    }
    cryptoKey = await crypto.subtle.importKey(
      'jwk',
      cleanJwkForImport(parsedJwk),
      { name: 'ECDSA', namedCurve: parsedJwk.crv || namedCurve },
      false,
      ['verify']
    );
  } else {
    const spkiBuffer = pemToArrayBuffer(keyOrJwk as string);
    cryptoKey = await crypto.subtle.importKey(
      'spki',
      new Uint8Array(spkiBuffer).buffer,
      { name: 'ECDSA', namedCurve },
      false,
      ['verify']
    );
  }

  const sigBuffer = base64UrlToBuffer(rawSignature);
  const dataBuffer = enc.encode(dataToSign);

  return await crypto.subtle.verify(
    { name: 'ECDSA', hash: { name: hash } },
    cryptoKey,
    new Uint8Array(sigBuffer).buffer,
    dataBuffer
  );
}

/**
 * Full JWT verification entrypoint
 */
export async function verifyJwt(options: VerifyOptions): Promise<JwtVerificationResult> {
  const { token, secretOrKey } = options;
  const decoded = decodeJwtParts(token);
  const warnings: string[] = [];

  if (!decoded.validFormat || !decoded.header || !decoded.payload) {
    return {
      isValid: false,
      signatureValid: false,
      claimsValid: false,
      policyEvaluated: false,
      signatureStatus: 'ERROR',
      isExpired: false,
      decoded,
      message: decoded.error || 'Malformed JWT token structure',
      warnings
    };
  }

  const alg = (decoded.header.alg || '').toUpperCase();

  // Expiration and date checks
  let isExpired = false;
  let claimsValid = true;
  let expirationDate: string | undefined;
  let issuedAtDate: string | undefined;
  let notBeforeDate: string | undefined;

  const suppliedPolicy = Boolean(options.expectedAlg || options.expectedIss || options.expectedAud);
  let clockTolerance = options.clockTolerance ?? 0;
  if (!Number.isFinite(clockTolerance) || clockTolerance < 0 || clockTolerance > 300) {
    claimsValid = false;
    warnings.push('Clock tolerance must be a finite number from 0 to 300 seconds');
    clockTolerance = 0;
  }
  for (const claim of ['iss', 'sub', 'jti']) {
    if (claim in decoded.payload && typeof decoded.payload[claim] !== 'string') {
      claimsValid = false;
      warnings.push(`Invalid "${claim}" claim: expected a string`);
    }
  }
  if ('aud' in decoded.payload && !(typeof decoded.payload.aud === 'string' || (Array.isArray(decoded.payload.aud) && decoded.payload.aud.every((aud: unknown) => typeof aud === 'string')))) {
    claimsValid = false;
    warnings.push('Invalid "aud" claim: expected a string or array of strings');
  }
  const nowSeconds = Math.floor(Date.now() / 1000);

  // Validate exp claim (NumericDate per RFC 7519 4.1.4: must be a finite number)
  if ('exp' in decoded.payload) {
    const expVal = decoded.payload.exp;
    if (typeof expVal !== 'number' || !Number.isFinite(expVal)) {
      claimsValid = false;
      warnings.push(`Invalid "exp" claim: Expected NumericDate number, received ${typeof expVal}`);
    } else {
      const expDate = new Date(expVal * 1000);
      if (!isNaN(expDate.getTime())) {
        expirationDate = expDate.toISOString();
      } else {
        claimsValid = false;
        warnings.push('Invalid "exp" claim: date is outside the supported range');
      }
      if (nowSeconds >= (expVal + clockTolerance)) {
        isExpired = true;
        claimsValid = false;
        warnings.push(`Token has expired at ${expDate.toUTCString()}`);
      }
    }
  }

  // Validate iat claim
  if ('iat' in decoded.payload) {
    const iatVal = decoded.payload.iat;
    if (typeof iatVal !== 'number' || !Number.isFinite(iatVal)) {
      claimsValid = false;
      warnings.push(`Invalid "iat" claim: Expected NumericDate number, received ${typeof iatVal}`);
    } else {
      const iatDate = new Date(iatVal * 1000);
      if (!isNaN(iatDate.getTime())) {
        issuedAtDate = iatDate.toISOString();
      } else {
        claimsValid = false;
        warnings.push('Invalid "iat" claim: date is outside the supported range');
      }
    }
  }

  // Validate nbf claim (NumericDate per RFC 7519 4.1.5: must be a finite number)
  if ('nbf' in decoded.payload) {
    const nbfVal = decoded.payload.nbf;
    if (typeof nbfVal !== 'number' || !Number.isFinite(nbfVal)) {
      claimsValid = false;
      warnings.push(`Invalid "nbf" claim: Expected NumericDate number, received ${typeof nbfVal}`);
    } else {
      const nbfDate = new Date(nbfVal * 1000);
      if (!isNaN(nbfDate.getTime())) {
        notBeforeDate = nbfDate.toISOString();
      } else {
        claimsValid = false;
        warnings.push('Invalid "nbf" claim: date is outside the supported range');
      }
      if (nowSeconds < (nbfVal - clockTolerance)) {
        claimsValid = false;
        warnings.push(`Token is not yet active (nbf: ${nbfDate.toUTCString()})`);
      }
    }
  }

  // Optional expected claims policy
  if (options.expectedAlg && alg !== options.expectedAlg.toUpperCase()) {
    claimsValid = false;
    warnings.push(`Algorithm mismatch: Expected ${options.expectedAlg}, token header specifies ${alg}`);
  }
  if (options.expectedIss && decoded.payload.iss !== options.expectedIss) {
    claimsValid = false;
    warnings.push(`Issuer mismatch: Expected ${options.expectedIss}, token has ${decoded.payload.iss}`);
  }
  if (options.expectedAud) {
    const aud = decoded.payload.aud;
    const matchesAud = Array.isArray(aud) ? aud.includes(options.expectedAud) : aud === options.expectedAud;
    if (!matchesAud) {
      claimsValid = false;
      warnings.push(`Audience mismatch: Expected ${options.expectedAud}, token has ${aud}`);
    }
  }

  // Security Check: Algorithm "none"
  if (alg === 'NONE' || !alg) {
    warnings.push('Algorithm "none" is insecure and allows critical authentication bypass');
    return {
      isValid: false,
      signatureValid: false,
      claimsValid: false,
      policyEvaluated: suppliedPolicy,
      signatureStatus: 'INVALID',
      algorithm: alg || 'none',
      isExpired,
      expirationDate,
      issuedAtDate,
      notBeforeDate,
      decoded,
      message: 'Insecure algorithm: "none" rejected',
      warnings
    };
  }

  // If no secret provided, report decoded status
  if (!secretOrKey || !secretOrKey.trim()) {
    return {
      isValid: false,
      signatureValid: false,
      claimsValid,
      policyEvaluated: false,
      signatureStatus: 'UNCHECKED',
      algorithm: alg,
      isExpired,
      expirationDate,
      issuedAtDate,
      notBeforeDate,
      decoded,
      message: 'Provide secret or public key to verify signature',
      warnings
    };
  }

  const dataToSign = `${decoded.rawHeader}.${decoded.rawPayload}`;
  if (alg.startsWith('HS') && /-----BEGIN[\s\S]*KEY-----/.test(secretOrKey)) {
    return { isValid: false, signatureValid: false, claimsValid, policyEvaluated: suppliedPolicy,
      signatureStatus: 'ERROR', algorithm: alg, isExpired, decoded, warnings,
      message: 'HMAC requires a shared secret; a PEM key cannot be used as an HMAC secret.' };
  }

  try {
    let signatureValid = false;

    if (alg === 'HS256' || alg === 'HS384' || alg === 'HS512') {
      signatureValid = await verifyHmacJwt(
        dataToSign,
        decoded.rawSignature || '',
        secretOrKey,
        alg
      );
    } else if (alg === 'RS256' || alg === 'RS384' || alg === 'RS512') {
      signatureValid = await verifyRsaJwt(
        dataToSign,
        decoded.rawSignature || '',
        secretOrKey,
        alg
      );
    } else if (alg === 'ES256' || alg === 'ES384' || alg === 'ES512') {
      signatureValid = await verifyEcdsaJwt(
        dataToSign,
        decoded.rawSignature || '',
        secretOrKey,
        alg
      );
    } else {
      warnings.push(`Algorithm "${alg}" is not currently supported in in-browser Web Crypto verification`);
      return {
        isValid: false,
        signatureValid: false,
        claimsValid,
        policyEvaluated: suppliedPolicy,
        signatureStatus: 'ERROR',
        algorithm: alg,
        isExpired,
        expirationDate,
        issuedAtDate,
        notBeforeDate,
        decoded,
        message: `Unsupported algorithm: ${alg}`,
        warnings
      };
    }

    if (signatureValid) {
      const overallValid = claimsValid;
      let msg = suppliedPolicy
        ? 'Signature and supplied claim policy verified successfully'
        : 'Signature and registered claim checks passed. Application issuer, audience and algorithm policy were not supplied.';
      if (!claimsValid) {
        msg = isExpired
          ? 'Signature is cryptographically valid, but token has expired'
          : `Signature is cryptographically valid, but claims validation failed (${warnings.join(', ')})`;
      }
      return {
        isValid: overallValid,
        signatureValid: true,
        claimsValid,
        policyEvaluated: suppliedPolicy,
        signatureStatus: 'VALID',
        algorithm: alg,
        isExpired,
        expirationDate,
        issuedAtDate,
        notBeforeDate,
        decoded,
        message: msg,
        warnings
      };
    } else {
      return {
        isValid: false,
        signatureValid: false,
        claimsValid,
        policyEvaluated: suppliedPolicy,
        signatureStatus: 'INVALID',
        algorithm: alg,
        isExpired,
        expirationDate,
        issuedAtDate,
        notBeforeDate,
        decoded,
        message: 'Signature mismatch: Invalid secret or tampered token',
        warnings
      };
    }
  } catch (err: any) {
    return {
      isValid: false,
      signatureValid: false,
      claimsValid,
      policyEvaluated: suppliedPolicy,
      signatureStatus: 'ERROR',
      algorithm: alg,
      isExpired,
      expirationDate,
      issuedAtDate,
      notBeforeDate,
      decoded,
      message: `Cryptographic verification error: ${err?.message || 'Check key format'}`,
      warnings
    };
  }
}


/**
 * Parses raw JSON string or object into a validated JwksDocument
 */
export function parseJwks(input: string | object): JwksDocument {
  let doc: any = input;
  if (typeof input === 'string') {
    try {
      doc = JSON.parse(input.trim());
    } catch {
      throw new Error('JWKS must be a valid JSON object');
    }
  }
  if (!doc || typeof doc !== 'object') {
    throw new Error('JWKS must be a valid JSON object');
  }
  if (Array.isArray(doc.keys)) {
    return { keys: doc.keys };
  }
  if (doc.kty) {
    return { keys: [doc] };
  }
  throw new Error('JWKS JSON must contain a "keys" array');
}

/**
 * Finds the matching JWK inside a JWKS document by kid and algorithm
 */
export function findMatchingJwk(jwks: JwksDocument, kid?: string, alg?: string): JwkKey | null {
  if (!jwks.keys || jwks.keys.length === 0) return null;

  const isHmac = alg ? alg.startsWith('HS') : false;
  const isRsa = alg ? (alg.startsWith('RS') || alg.startsWith('PS')) : false;
  const isEc = alg ? alg.startsWith('ES') : false;
  const expectedKty = isHmac ? 'oct' : isRsa ? 'RSA' : isEc ? 'EC' : undefined;

  // If explicit kid provided, it must match that specific key ID and compatible key type
  if (kid) {
    const key = jwks.keys.find((k) => k.kid === kid);
    if (key) {
      if (expectedKty && key.kty !== expectedKty) return null;
      return key;
    }
    return null;
  }

  // Otherwise match by algorithm or compatible key type
  if (alg) {
    const matchByAlg = jwks.keys.find((k) => k.alg && k.alg.toUpperCase() === alg.toUpperCase());
    if (matchByAlg) return matchByAlg;

    if (expectedKty) {
      const matchByKty = jwks.keys.find((k) => k.kty === expectedKty);
      if (matchByKty) return matchByKty;
      return null;
    }
  }

  return jwks.keys[0] || null;
}

/**
 * Verifies a JWT directly against a JWKS document or JSON string.
 * Automatically matches the key by header "kid" and algorithm.
 */
export async function verifyJwtWithJwks(
  token: string,
  jwksInput: string | JwksDocument,
  options?: Partial<VerifyOptions>
): Promise<JwtVerificationResult & { matchedKey?: JwkKey }> {
  const decoded = decodeJwtParts(token);
  if (!decoded.validFormat || !decoded.header || !decoded.payload) {
    return {
      isValid: false,
      signatureValid: false,
      claimsValid: false,
      policyEvaluated: false,
      signatureStatus: 'ERROR',
      isExpired: false,
      decoded,
      message: decoded.error || 'Malformed JWT token structure',
      warnings: ['Invalid JWT format']
    };
  }

  let jwks: JwksDocument;
  try {
    jwks = typeof jwksInput === 'string' ? parseJwks(jwksInput) : jwksInput;
  } catch (err: any) {
    return {
      isValid: false,
      signatureValid: false,
      claimsValid: false,
      policyEvaluated: false,
      signatureStatus: 'ERROR',
      isExpired: false,
      decoded,
      message: `Invalid JWKS JSON format: ${err?.message || 'Check JWKS document'}`,
      warnings: ['JWKS document could not be parsed']
    };
  }

  const kid = decoded.header.kid;
  const alg = (decoded.header.alg || 'RS256').toUpperCase();
  const matchedKey = findMatchingJwk(jwks, kid, alg);

  if (!matchedKey) {
    const reason = kid
      ? `No matching public key found in JWKS with kid="${kid}" and alg="${alg}"`
      : `No matching public key found in JWKS for algorithm "${alg}"`;
    return {
      isValid: false,
      signatureValid: false,
      claimsValid: false,
      policyEvaluated: false,
      signatureStatus: 'INVALID',
      algorithm: alg,
      isExpired: false,
      decoded,
      message: reason,
      warnings: [reason, `JWKS contains ${jwks.keys?.length || 0} key(s)`]
    };
  }

  const isHmac = alg.startsWith('HS');
  if (isHmac && matchedKey.kty !== 'oct') {
    return {
      isValid: false,
      signatureValid: false,
      claimsValid: false,
      policyEvaluated: false,
      signatureStatus: 'ERROR',
      algorithm: alg,
      isExpired: false,
      decoded,
      matchedKey,
      message: `Algorithm confusion blocked: token declares ${alg} (HMAC) but JWKS key "${matchedKey.kid ?? '?'}" is ${matchedKey.kty} (asymmetric).`,
      warnings: ['A symmetric token cannot be verified against an asymmetric public key.']
    };
  }
  if (!isHmac && matchedKey.kty === 'oct') {
    return {
      isValid: false,
      signatureValid: false,
      claimsValid: false,
      policyEvaluated: false,
      signatureStatus: 'ERROR',
      algorithm: alg,
      isExpired: false,
      decoded,
      matchedKey,
      message: `Algorithm confusion blocked: token declares ${alg} (asymmetric) but JWKS key "${matchedKey.kid ?? '?'}" is oct (symmetric HMAC).`,
      warnings: ['An asymmetric token cannot be verified against a symmetric HMAC secret.']
    };
  }

  const result = await verifyJwt({
    token,
    secretOrKey: JSON.stringify(matchedKey),
    ...options
  });

  return {
    ...result,
    matchedKey
  };
}

/**
 * Popular JWKS Endpoints Catalog
 */
export const JWKS_PRESETS = [
  { name: 'Google OAuth / APIs', url: 'https://www.googleapis.com/oauth2/v3/certs', provider: 'google' },
  { name: 'Firebase Authentication', url: 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com', provider: 'firebase' },
  { name: 'GitHub Actions OIDC', url: 'https://token.actions.githubusercontent.com/.well-known/jwks', provider: 'github' },
  { name: 'Microsoft Entra ID (Azure AD)', url: 'https://login.microsoftonline.com/common/discovery/v2.0/keys', provider: 'microsoft' },
  { name: 'Apple Sign-In', url: 'https://appleid.apple.com/auth/keys', provider: 'apple' },
];
