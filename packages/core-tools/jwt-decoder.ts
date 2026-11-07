/**
 * DevOmniTools JWT Decoder & Inspector Engine
 * 100% Client-Side RFC 7519 compliant JSON Web Token parser.
 * Zero external dependencies, pure browser/runtime standard APIs.
 */

export interface JwtHeader {
  alg?: string;
  typ?: string;
  kid?: string;
  [key: string]: any;
}

export interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: any;
}

export interface StandardClaimInfo {
  key: string;
  name: string;
  description: string;
  value: any;
  formattedValue?: string;
}

export interface JwtTokenStatus {
  state: 'ACTIVE' | 'EXPIRED' | 'NOT_YET_VALID' | 'NO_EXPIRY';
  isExpired: boolean;
  isNotYetValid: boolean;
  expiresInSeconds?: number;
  humanExpiryText: string;
  expDate?: Date;
  iatDate?: Date;
  nbfDate?: Date;
}

export interface SdJwtDisclosure {
  raw: string;
  salt: string;
  key?: string;
  value: any;
  isArrayElement: boolean;
}

export interface SdJwtInfo {
  isSdJwt: boolean;
  issuerJwt: string;
  disclosures: SdJwtDisclosure[];
  keyBindingJwt?: {
    raw: string;
    header?: JwtHeader;
    payload?: JwtPayload;
    status?: JwtTokenStatus;
  };
  reconstructedPayload: Record<string, any>;
}

export interface JwtDecodeResult {
  success: boolean;
  error?: string;
  isSdJwt?: boolean;
  sdJwtInfo?: SdJwtInfo;
  rawHeader?: string;
  rawPayload?: string;
  rawSignature?: string;
  header?: JwtHeader;
  payload?: JwtPayload;
  status?: JwtTokenStatus;
  claims?: StandardClaimInfo[];
  customClaims?: { key: string; value: any }[];
}

export const STANDARD_CLAIM_METADATA: Record<string, { name: string; description: string }> = {
  iss: { name: 'Issuer', description: 'Identifies the principal that issued the JWT' },
  sub: { name: 'Subject', description: 'Identifies the principal that is the subject of the JWT' },
  aud: { name: 'Audience', description: 'Identifies the recipients that the JWT is intended for' },
  exp: { name: 'Expiration Time', description: 'Identifies the expiration time on or after which the JWT must not be accepted' },
  nbf: { name: 'Not Before', description: 'Identifies the time before which the JWT must not be accepted' },
  iat: { name: 'Issued At', description: 'Identifies the time at which the JWT was issued' },
  jti: { name: 'JWT ID', description: 'Case-sensitive unique identifier for the token' },
  _sd_alg: { name: 'SD-JWT Hash Algorithm', description: 'Specifies the hash algorithm (e.g. sha-256) used for selective disclosure digests' },
  _sd: { name: 'Selective Disclosure Digests', description: 'Array of digest hashes representing undisclosed or selectively disclosable claims' }
};

/**
 * Safely decodes a Base64Url string to UTF-8 text in both Browser and Node.js runtimes.
 */
export function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }

  try {
    if (typeof atob === 'function') {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new TextDecoder().decode(bytes);
    } else if (typeof Buffer !== 'undefined') {
      return Buffer.from(base64, 'base64').toString('utf-8');
    }
    throw new Error('Base64 decoder unavailable');
  } catch (err: any) {
    throw new Error('Invalid Base64Url encoding: ' + (err.message || 'malformed string'));
  }
}

/**
 * Formats a duration in seconds into human-readable relative time (e.g. "2 hours, 15 minutes").
 */
export function formatDuration(seconds: number): string {
  const abs = Math.abs(seconds);
  const days = Math.floor(abs / 86400);
  const hours = Math.floor((abs % 86400) / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const secs = Math.floor(abs % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.slice(0, 2).join(' ');
}

/**
 * Calculates token status and expiration details relative to a given reference time (defaults to now).
 */
export function calculateTokenStatus(payload: JwtPayload, nowSec: number = Math.floor(Date.now() / 1000)): JwtTokenStatus {
  const exp = typeof payload.exp === 'number' ? payload.exp : undefined;
  const iat = typeof payload.iat === 'number' ? payload.iat : undefined;
  const nbf = typeof payload.nbf === 'number' ? payload.nbf : undefined;

  const expDate = exp ? new Date(exp * 1000) : undefined;
  const iatDate = iat ? new Date(iat * 1000) : undefined;
  const nbfDate = nbf ? new Date(nbf * 1000) : undefined;

  if (nbf && nowSec < nbf) {
    const diff = nbf - nowSec;
    return {
      state: 'NOT_YET_VALID',
      isExpired: false,
      isNotYetValid: true,
      expiresInSeconds: exp ? exp - nowSec : undefined,
      humanExpiryText: `Not valid for another ${formatDuration(diff)}`,
      expDate,
      iatDate,
      nbfDate
    };
  }

  if (exp === undefined) {
    return {
      state: 'NO_EXPIRY',
      isExpired: false,
      isNotYetValid: false,
      humanExpiryText: 'No expiration date set (Token does not expire)',
      expDate,
      iatDate,
      nbfDate
    };
  }

  if (nowSec >= exp) {
    const diff = nowSec - exp;
    return {
      state: 'EXPIRED',
      isExpired: true,
      isNotYetValid: false,
      expiresInSeconds: exp - nowSec,
      humanExpiryText: `Expired ${formatDuration(diff)} ago`,
      expDate,
      iatDate,
      nbfDate
    };
  }

  const diff = exp - nowSec;
  return {
    state: 'ACTIVE',
    isExpired: false,
    isNotYetValid: false,
    expiresInSeconds: diff,
    humanExpiryText: `Expires in ${formatDuration(diff)}`,
    expDate,
    iatDate,
    nbfDate
  };
}

/**
 * Decodes and inspects a complete JWT token or SD-JWT (Selective Disclosure JWT) string.
 */
export function decodeJwt(rawToken: string, nowSec: number = Math.floor(Date.now() / 1000)): JwtDecodeResult {
  const token = rawToken.trim();
  if (!token) {
    return { success: false, error: 'Token cannot be empty' };
  }

  let isSdJwt = false;
  let sdJwtInfo: SdJwtInfo | undefined = undefined;
  let primaryJwtStr = token;

  // Detect SD-JWT (tilde separated disclosures per IETF SD-JWT & Chrome email verification)
  if (token.includes('~')) {
    isSdJwt = true;
    const sdParts = token.split('~');
    primaryJwtStr = sdParts[0].trim();

    const disclosures: SdJwtDisclosure[] = [];
    let keyBindingJwt: SdJwtInfo['keyBindingJwt'] | undefined = undefined;

    const remainingParts = sdParts.slice(1);
    for (let i = 0; i < remainingParts.length; i++) {
      const part = remainingParts[i].trim();
      if (!part) continue;

      // Check if last segment is a Key Binding JWT (KB-JWT)
      if (i === remainingParts.length - 1 && part.split('.').length === 3) {
        try {
          const kbParts = part.split('.');
          const kbHeader = JSON.parse(base64UrlDecode(kbParts[0]));
          const kbPayload = JSON.parse(base64UrlDecode(kbParts[1]));
          const kbStatus = calculateTokenStatus(kbPayload, nowSec);
          keyBindingJwt = {
            raw: part,
            header: kbHeader,
            payload: kbPayload,
            status: kbStatus
          };
          continue;
        } catch {
          // If not a valid JWT, proceed to disclosure parser
        }
      }

      // Decode disclosure JSON array: [salt, claim_name, claim_value] or [salt, value]
      try {
        const decodedStr = base64UrlDecode(part);
        const parsed = JSON.parse(decodedStr);
        if (Array.isArray(parsed)) {
          if (parsed.length === 3) {
            disclosures.push({
              raw: part,
              salt: String(parsed[0]),
              key: String(parsed[1]),
              value: parsed[2],
              isArrayElement: false
            });
          } else if (parsed.length === 2) {
            disclosures.push({
              raw: part,
              salt: String(parsed[0]),
              value: parsed[1],
              isArrayElement: true
            });
          }
        }
      } catch {
        // Silently skip corrupted disclosure chunks
      }
    }

    sdJwtInfo = {
      isSdJwt: true,
      issuerJwt: primaryJwtStr,
      disclosures,
      keyBindingJwt,
      reconstructedPayload: {}
    };
  }

  const parts = primaryJwtStr.split('.');
  if (parts.length !== 3) {
    return {
      success: false,
      error: `Invalid JWT format. Expected 3 dot-separated segments (Header.Payload.Signature), but received ${parts.length}.`
    };
  }

  const [rawHeader, rawPayload, rawSignature] = parts;

  let header: JwtHeader;
  try {
    const decodedHeaderStr = base64UrlDecode(rawHeader);
    header = JSON.parse(decodedHeaderStr);
    if (typeof header !== 'object' || header === null || Array.isArray(header)) {
      return { success: false, error: 'JWT Header must be a valid JSON object' };
    }
  } catch (err: any) {
    return { success: false, error: `Failed to decode JWT Header: ${err.message}` };
  }

  let payload: JwtPayload;
  try {
    const decodedPayloadStr = base64UrlDecode(rawPayload);
    payload = JSON.parse(decodedPayloadStr);
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
      return { success: false, error: 'JWT Payload must be a valid JSON object' };
    }
  } catch (err: any) {
    return { success: false, error: `Failed to decode JWT Payload: ${err.message}` };
  }

  const status = calculateTokenStatus(payload, nowSec);

  // If SD-JWT, build reconstructed payload with disclosed claims
  if (isSdJwt && sdJwtInfo) {
    const reconstructed: Record<string, any> = { ...payload };
    for (const disc of sdJwtInfo.disclosures) {
      if (disc.key && !disc.isArrayElement) {
        reconstructed[disc.key] = disc.value;
      }
    }
    sdJwtInfo.reconstructedPayload = reconstructed;
  }

  // Parse claims
  const claims: StandardClaimInfo[] = [];
  const customClaims: { key: string; value: any }[] = [];

  for (const [key, val] of Object.entries(payload)) {
    if (STANDARD_CLAIM_METADATA[key]) {
      let formattedValue: string | undefined = undefined;
      if (key === 'exp' && status.expDate) {
        formattedValue = `${status.expDate.toISOString()} (${status.humanExpiryText})`;
      } else if (key === 'iat' && status.iatDate) {
        formattedValue = status.iatDate.toISOString();
      } else if (key === 'nbf' && status.nbfDate) {
        formattedValue = status.nbfDate.toISOString();
      } else if (Array.isArray(val)) {
        formattedValue = val.join(', ');
      } else if (typeof val === 'object' && val !== null) {
        formattedValue = JSON.stringify(val);
      }

      claims.push({
        key,
        name: STANDARD_CLAIM_METADATA[key].name,
        description: STANDARD_CLAIM_METADATA[key].description,
        value: val,
        formattedValue
      });
    } else {
      customClaims.push({ key, value: val });
    }
  }

  // Append disclosed claims into customClaims list if SD-JWT
  if (isSdJwt && sdJwtInfo) {
    for (const disc of sdJwtInfo.disclosures) {
      if (disc.key) {
        customClaims.push({
          key: `${disc.key} [Disclosed]`,
          value: disc.value
        });
      }
    }
  }

  return {
    success: true,
    isSdJwt,
    sdJwtInfo,
    rawHeader,
    rawPayload,
    rawSignature,
    header,
    payload,
    status,
    claims,
    customClaims
  };
}

/**
 * Generates sample JWTs for demonstration and testing.
 */
export function getSampleJwts(): { active: string; expired: string; sdJwt: string } {
  // Base64Url helper for sample generator
  const toBase64Url = (obj: any) => {
    const json = typeof obj === 'string' ? obj : JSON.stringify(obj);
    const base64 = typeof Buffer !== 'undefined'
      ? Buffer.from(json).toString('base64')
      : btoa(unescape(encodeURIComponent(json)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  const header = { alg: 'HS256', typ: 'JWT', kid: 'devomnitools-demo-key-01' };
  const now = Math.floor(Date.now() / 1000);

  const activePayload = {
    iss: 'https://auth.devomnitools.com',
    sub: 'usr_89f72b10a28',
    aud: ['https://api.devomnitools.com', 'devomnitools-web-app'],
    exp: now + 3600 * 24, // 24 hours in future
    nbf: now - 60,
    iat: now,
    jti: 'd19c36ec-981f-4bb2-b5bc-1845bbfe61aa',
    user: {
      name: 'Muhammad Umair',
      email: 'alex.dev@example.com',
      role: 'System Architect',
      permissions: ['read:tools', 'write:tools', 'admin:system']
    }
  };

  const expiredPayload = {
    iss: 'https://accounts.google.com',
    sub: '109823746192837461928',
    aud: 'my-mobile-app.apps.googleusercontent.com',
    exp: now - 3600 * 72, // 3 days in past
    iat: now - 3600 * 73,
    jti: 'c6127110-87a3-488f-9a99-4d6b63d5c907',
    email: 'developer@example.org',
    email_verified: true
  };

  const activeToken = `${toBase64Url(header)}.${toBase64Url(activePayload)}.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk`;
  const expiredToken = `${toBase64Url(header)}.${toBase64Url(expiredPayload)}.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c`;

  // SD-JWT Sample: Chrome Email Verification Token with selective disclosures & Key Binding JWT
  const sdHeader = { alg: 'ES256', typ: 'sd+jwt' };
  const sdPayload = {
    iss: 'https://issuer.devomnitools.com',
    sub: 'usr_sd_jwt_chrome_test',
    aud: 'https://chrome-email-verification.example.com',
    exp: now + 3600 * 24,
    iat: now,
    _sd_alg: 'sha-256',
    _sd: [
      '26U_m8hg1vXf_pD5n8QY6zA8bC0dE2fG4hJ6kL8mN0p',
      'k3J9h8F6b5D4c3B2a1Z0yX8wV6uT4sR2qP0oM8kI6gE'
    ],
    purpose: 'Chrome Email Verification',
    token_spec: 'draft-ietf-oauth-selective-disclosure-jwt'
  };

  const disc1 = toBase64Url(['salt_email_rnd892', 'email', 'verified.dev@devomnitools.com']);
  const disc2 = toBase64Url(['salt_status_rnd441', 'email_verified', true]);

  const kbHeader = { alg: 'ES256', typ: 'kb+jwt' };
  const kbPayload = {
    iat: now,
    aud: 'https://chrome-email-verification.example.com',
    nonce: 'nonce_chr_918237'
  };

  const sdIssuerJwt = `${toBase64Url(sdHeader)}.${toBase64Url(sdPayload)}.demoIssuerSignatureEs256`;
  const sdKbJwt = `${toBase64Url(kbHeader)}.${toBase64Url(kbPayload)}.demoHolderSignatureKb`;
  const sdToken = `${sdIssuerJwt}~${disc1}~${disc2}~${sdKbJwt}`;

  return { active: activeToken, expired: expiredToken, sdJwt: sdToken };
}
