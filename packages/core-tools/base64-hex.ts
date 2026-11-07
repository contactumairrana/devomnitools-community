/**
 * Pure Client-Side Base64 & Hex Conversion Engine
 * Zero Server Transmission | 100% In-Memory Browser Sandbox
 * Robust UTF-8 & Emoji support using TextEncoder & TextDecoder
 * Pure Mathematical RFC 4648 Base64 Byte-to-Char Mapping (Zero btoa/atob dependency)
 */

export type ConversionMode = 
  | 'text-to-base64'
  | 'base64-to-text'
  | 'text-to-hex'
  | 'hex-to-text'
  | 'base64-to-hex'
  | 'hex-to-base64'
  | 'text-to-binary'
  | 'binary-to-text'
  | 'hex-to-binary'
  | 'binary-to-hex'
  | 'base64-to-binary'
  | 'binary-to-base64';

export type HexDelimiter = 'none' | 'space' | 'colon';
export type HexCasing = 'lower' | 'upper';
export type BinaryDelimiter = 'space' | 'none' | 'byte-prefix' | 'comma';
export type Endianness = 'big' | 'little';

export interface ConvertOptions {
  mode: ConversionMode;
  urlSafe?: boolean;
  strictPadding?: boolean;
  hexDelimiter?: HexDelimiter;
  hexCasing?: HexCasing;
  binaryDelimiter?: BinaryDelimiter;
  endianness?: Endianness;
}

export interface ConvertResult {
  success: boolean;
  output: string;
  byteCount: number;
  expectedLength?: number;
  error?: string;
}

// RFC 4648 Standard and URL-Safe Alphabets
const RFC4648_STD_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const RFC4648_URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

// Inverted lookup tables for fast 6-bit index resolution
const BASE64_INV_STD = new Int16Array(256).fill(-1);
const BASE64_INV_URL = new Int16Array(256).fill(-1);
const BASE64_INV_LOOKUP = new Int16Array(256).fill(-1);

for (let i = 0; i < RFC4648_STD_CHARS.length; i++) {
  BASE64_INV_STD[RFC4648_STD_CHARS.charCodeAt(i)] = i;
  BASE64_INV_URL[RFC4648_URL_CHARS.charCodeAt(i)] = i;
  BASE64_INV_LOOKUP[RFC4648_STD_CHARS.charCodeAt(i)] = i;
  BASE64_INV_LOOKUP[RFC4648_URL_CHARS.charCodeAt(i)] = i;
}

// Precomputed 2-character hex lookup tables for chunked serialization
const HEX_TABLE_LOWER = new Array<string>(256);
const HEX_TABLE_UPPER = new Array<string>(256);
for (let i = 0; i < 256; i++) {
  const h = i.toString(16).padStart(2, '0');
  HEX_TABLE_LOWER[i] = h;
  HEX_TABLE_UPPER[i] = h.toUpperCase();
}

/**
 * Calculates expected Base64 encoded length based on RFC 4648:
 * L_out = 4 * ceil(L_in / 3) for standard padded Base64
 */
export function computeBase64Length(inputByteLength: number, strictPadding = true): number {
  if (inputByteLength <= 0) return 0;
  if (strictPadding) {
    return 4 * Math.ceil(inputByteLength / 3);
  }
  return Math.ceil((inputByteLength * 8) / 6);
}

/**
 * Encodes arbitrary UTF-8 text (including emojis, Arabic, CJK) to Uint8Array
 */
export function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Decodes Uint8Array back to UTF-8 text with fatal error on malformed bytes
 */
export function bytesToText(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new Error('Malformed UTF-8 byte sequence: Decoded binary data is not valid UTF-8 text.');
  }
}

/**
 * Converts Uint8Array bytes to Base64 string using pure bitwise arithmetic
 * Absolutely zero btoa() usage, preventing Call Stack limits and Unicode exceptions.
 */
export function bytesToBase64(bytes: Uint8Array, urlSafe = false, strictPadding = true): string {
  if (bytes.length === 0) return '';
  const alphabet = urlSafe ? RFC4648_URL_CHARS : RFC4648_STD_CHARS;
  let result = '';
  const len = bytes.length;
  const extra = len % 3;
  const mainLen = len - extra;
  const chunks: string[] = [];

  for (let i = 0; i < mainLen; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    result += alphabet[(b0 >> 2) & 0x3F];
    result += alphabet[((b0 & 0x03) << 4) | ((b1 >> 4) & 0x0F)];
    result += alphabet[((b1 & 0x0F) << 2) | ((b2 >> 6) & 0x03)];
    result += alphabet[b2 & 0x3F];
    if (result.length >= 8192) { chunks.push(result); result = ''; }
  }

  if (extra === 1) {
    const b0 = bytes[mainLen];
    result += alphabet[(b0 >> 2) & 0x3F];
    result += alphabet[(b0 & 0x03) << 4];
    if (strictPadding && !urlSafe) {
      result += '==';
    }
  } else if (extra === 2) {
    const b0 = bytes[mainLen];
    const b1 = bytes[mainLen + 1];
    result += alphabet[(b0 >> 2) & 0x3F];
    result += alphabet[((b0 & 0x03) << 4) | ((b1 >> 4) & 0x0F)];
    result += alphabet[(b1 & 0x0F) << 2];
    if (strictPadding && !urlSafe) {
      result += '=';
    }
  }

  chunks.push(result);
  return chunks.join('');
}

export interface Base64DecodeOptions {
  urlSafe?: boolean;
}

/**
 * Converts Base64 string back to Uint8Array bytes using pure bitwise arithmetic
 * Implements strict RFC 4648 validation: rejects non-ASCII, interior/excess padding,
 * invalid residual lengths, mismatched alphabets, and non-zero pad bits.
 */
export function base64ToBytes(base64: string, options: Base64DecodeOptions = {}): Uint8Array {
  const clean = base64.replace(/[\t\n\r ]+/g, '');
  if (!clean) return new Uint8Array(0);

  const isUrlSafe = options.urlSafe;
  if (isUrlSafe === undefined && /[+/]/.test(clean) && /[-_]/.test(clean)) {
    throw new Error('Invalid Base64 sequence: mixed standard and URL-safe alphabets.');
  }
  let firstPad = -1;
  let padCount = 0;

  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    if (code > 127) {
      throw new Error('Invalid Base64 sequence: String contains non-Base64 characters.');
    }
    const ch = clean[i];
    if (ch === '=') {
      if (firstPad === -1) firstPad = i;
      padCount++;
    } else {
      if (firstPad !== -1) {
        throw new Error('Invalid Base64 sequence: interior padding.');
      }
      if (isUrlSafe === true) {
        if (ch === '+' || ch === '/') {
          throw new Error('Invalid Base64 sequence: non-URL-safe characters in URL-safe mode.');
        }
      } else if (isUrlSafe === false) {
        if (ch === '-' || ch === '_') {
          throw new Error('Invalid Base64 sequence: URL-safe characters in standard mode.');
        }
      }
      const val = isUrlSafe === true 
        ? BASE64_INV_URL[code] 
        : isUrlSafe === false 
          ? BASE64_INV_STD[code] 
          : BASE64_INV_LOOKUP[code];
      if (val === -1) {
        throw new Error('Invalid Base64 sequence: String contains non-Base64 characters.');
      }
    }
  }

  if (padCount > 2) {
    throw new Error('Invalid Base64 sequence: excess padding.');
  }

  if (padCount > 0 && clean.length % 4 !== 0) {
    throw new Error('Invalid Base64 sequence: malformed length with padding.');
  }

  const unpaddedLen = clean.length - padCount;
  if (unpaddedLen % 4 === 1) {
    throw new Error('Invalid Base64 sequence: residual length 1 (incomplete quantum).');
  }

  let byteLen = Math.floor(unpaddedLen / 4) * 3;
  const rem = unpaddedLen % 4;
  if (rem === 2) byteLen += 1;
  else if (rem === 3) byteLen += 2;

  const bytes = new Uint8Array(byteLen);
  let byteIdx = 0;

  for (let i = 0; i < unpaddedLen; i += 4) {
    const chunkChars = unpaddedLen - i;
    const c0 = BASE64_INV_LOOKUP[clean.charCodeAt(i)];
    const c1 = chunkChars > 1 ? BASE64_INV_LOOKUP[clean.charCodeAt(i + 1)] : 0;
    const c2 = chunkChars > 2 ? BASE64_INV_LOOKUP[clean.charCodeAt(i + 2)] : 0;
    const c3 = chunkChars > 3 ? BASE64_INV_LOOKUP[clean.charCodeAt(i + 3)] : 0;

    if (chunkChars === 2) {
      if ((c1 & 0x0F) !== 0) {
        throw new Error('Invalid Base64 sequence: non-zero pad bits.');
      }
      bytes[byteIdx++] = (c0 << 2) | (c1 >> 4);
    } else if (chunkChars === 3) {
      if ((c2 & 0x03) !== 0) {
        throw new Error('Invalid Base64 sequence: non-zero pad bits.');
      }
      bytes[byteIdx++] = (c0 << 2) | (c1 >> 4);
      bytes[byteIdx++] = ((c1 & 0x0F) << 4) | (c2 >> 2);
    } else {
      bytes[byteIdx++] = (c0 << 2) | (c1 >> 4);
      bytes[byteIdx++] = ((c1 & 0x0F) << 4) | (c2 >> 2);
      bytes[byteIdx++] = ((c2 & 3) << 6) | c3;
    }
  }

  return bytes;
}

/**
 * Converts Uint8Array bytes to Hexadecimal string with bounded chunking
 * Eliminates large V8 array allocations for massive datasets.
 */
export function bytesToHex(bytes: Uint8Array, delimiter: HexDelimiter = 'none', casing: HexCasing = 'lower'): string {
  if (bytes.length === 0) return '';
  const sep = delimiter === 'space' ? ' ' : delimiter === 'colon' ? ':' : '';
  const table = casing === 'upper' ? HEX_TABLE_UPPER : HEX_TABLE_LOWER;
  const CHUNK_SIZE = 8192;
  let out = '';

  if (!sep) {
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, bytes.length);
      let chunk = '';
      for (let j = i; j < end; j++) {
        chunk += table[bytes[j]];
      }
      out += chunk;
    }
  } else {
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, bytes.length);
      let chunk = '';
      for (let j = i; j < end; j++) {
        chunk += (i === 0 && j === 0 ? '' : sep) + table[bytes[j]];
      }
      out += chunk;
    }
  }

  return out;
}

/**
 * Converts Hexadecimal string back to Uint8Array bytes
 */
export function hexToBytes(hex: string): Uint8Array {
  const trimmed = hex.trim();
  if (!trimmed) return new Uint8Array(0);

  // Strip 0x / 0X prefix, whitespace, colons, hyphens
  const clean = trimmed.replace(/^0x/i, '').replace(/[\s:-]/g, '');

  if (clean.length % 2 !== 0) {
    throw new Error('Invalid Hex sequence: Length must be even (2 characters per byte).');
  }

  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new Error('Invalid Hex sequence: String contains non-hexadecimal characters.');
  }

  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    const hi = parseInt(clean[i], 16);
      const lo = parseInt(clean[i + 1], 16);
      bytes[i / 2] = (hi << 4) | lo;
  }

  return bytes;
}

/**
 * Converts Uint8Array bytes to 8-bit Binary representation
 * Supports formatting delimiters ('space', 'none', 'byte-prefix', 'comma')
 * and Big-Endian (MSB) vs. Little-Endian (LSB) bit ordering.
 */
export function bytesToBinary(
  bytes: Uint8Array, 
  delimiter: BinaryDelimiter = 'space', 
  endianness: Endianness = 'big'
): string {
  if (bytes.length === 0) return '';
  const parts: string[] = new Array(bytes.length);

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    let bin = byte.toString(2).padStart(8, '0');
    if (endianness === 'little') {
      bin = bin.split('').reverse().join('');
    }
    if (delimiter === 'byte-prefix') {
      parts[i] = '0b' + bin;
    } else {
      parts[i] = bin;
    }
  }

  if (delimiter === 'none') {
    return parts.join('');
  } else if (delimiter === 'comma') {
    return parts.join(',');
  } else {
    return parts.join(' ');
  }
}

/**
 * Converts 8-bit Binary string back to Uint8Array bytes
 * Tolerates '0b' prefixes, spaces, commas, colons, underscores, and hyphens.
 */
export function binaryToBytes(binary: string, endianness: Endianness = 'big'): Uint8Array {
  const trimmed = binary.trim();
  if (!trimmed) return new Uint8Array(0);

  // Clean input: remove 0b prefixes, spaces, commas, colons, newlines, underscores, hyphens
  const clean = trimmed
    .replace(/0b/gi, '')
    .replace(/[\s,:_\-\r\n\t]/g, '');

  if (clean.length === 0) return new Uint8Array(0);

  if (!/^[01]*$/.test(clean)) {
    throw new Error('Invalid Binary sequence: String contains characters other than 0 and 1.');
  }

  if (clean.length % 8 !== 0) {
    throw new Error(`Invalid Binary sequence: Bit count (${clean.length}) must be a multiple of 8 (8 bits per byte).`);
  }

  const byteCount = clean.length / 8;
  const bytes = new Uint8Array(byteCount);

  for (let i = 0; i < byteCount; i++) {
    let chunk = clean.slice(i * 8, (i + 1) * 8);
    if (endianness === 'little') {
      chunk = chunk.split('').reverse().join('');
    }
    bytes[i] = parseInt(chunk, 2);
  }

  return bytes;
}

/**
 * Master Execution Dispatcher
 */
export function convertData(input: string, options: ConvertOptions): ConvertResult {
  if (!input) {
    return { success: true, output: '', byteCount: 0 };
  }

  try {
    let outputBytes: Uint8Array;
    let outputString = '';
    const strictPadding = options.strictPadding !== false;

    switch (options.mode) {
      case 'text-to-base64': {
        outputBytes = textToBytes(input);
        outputString = bytesToBase64(outputBytes, options.urlSafe, strictPadding);
        break;
      }

      case 'base64-to-text': {
        outputBytes = base64ToBytes(input, { urlSafe: options.urlSafe });
        outputString = bytesToText(outputBytes);
        break;
      }

      case 'text-to-hex': {
        outputBytes = textToBytes(input);
        outputString = bytesToHex(outputBytes, options.hexDelimiter, options.hexCasing);
        break;
      }

      case 'hex-to-text': {
        outputBytes = hexToBytes(input);
        outputString = bytesToText(outputBytes);
        break;
      }

      case 'base64-to-hex': {
        outputBytes = base64ToBytes(input, { urlSafe: options.urlSafe });
        outputString = bytesToHex(outputBytes, options.hexDelimiter, options.hexCasing);
        break;
      }

      case 'hex-to-base64': {
        outputBytes = hexToBytes(input);
        outputString = bytesToBase64(outputBytes, options.urlSafe, strictPadding);
        break;
      }

      case 'text-to-binary': {
        outputBytes = textToBytes(input);
        outputString = bytesToBinary(outputBytes, options.binaryDelimiter, options.endianness);
        break;
      }

      case 'binary-to-text': {
        outputBytes = binaryToBytes(input, options.endianness);
        outputString = bytesToText(outputBytes);
        break;
      }

      case 'hex-to-binary': {
        outputBytes = hexToBytes(input);
        outputString = bytesToBinary(outputBytes, options.binaryDelimiter, options.endianness);
        break;
      }

      case 'binary-to-hex': {
        outputBytes = binaryToBytes(input, options.endianness);
        outputString = bytesToHex(outputBytes, options.hexDelimiter, options.hexCasing);
        break;
      }

      case 'base64-to-binary': {
        outputBytes = base64ToBytes(input, { urlSafe: options.urlSafe });
        outputString = bytesToBinary(outputBytes, options.binaryDelimiter, options.endianness);
        break;
      }

      case 'binary-to-base64': {
        outputBytes = binaryToBytes(input, options.endianness);
        outputString = bytesToBase64(outputBytes, options.urlSafe, strictPadding);
        break;
      }

      default:
        throw new Error(`Unsupported conversion mode: ${options.mode}`);
    }

    return {
      success: true,
      output: outputString,
      byteCount: outputBytes.byteLength,
      expectedLength: computeBase64Length(outputBytes.byteLength, strictPadding)
    };
  } catch (err: unknown) {
    return {
      success: false,
      output: '',
      byteCount: 0,
      error: err instanceof Error ? err.message : 'Unknown encoding/decoding error occurred.'
    };
  }
}

/**
 * Provides curated sample payloads across all modes
 */
export function getSamplePayload(mode: ConversionMode): string {
  switch (mode) {
    case 'text-to-base64':
    case 'text-to-hex':
      return 'Hello DevOmniTools! مرحبا بك في منصة الأدوات 🚀 100% Client-Side Private Processing.';

    case 'base64-to-text':
    case 'base64-to-hex':
      return 'SGVsbG8gT21uaVRvb2xzISDYp9mE2LPZhNin2YUg2LnZhNmK2YPZhSBmaSBlbC1hbGFtIOKaoe+4jyAxMDAlIENsaWVudC1TaWRlIFByaXZhdGUgUHJvY2Vzc2luZy4=';

    case 'hex-to-text':
    case 'hex-to-base64':
      return '48 65 6c 6c 6f 20 4f 6d 6e 69 54 6f 6f 6c 73 21 20 d9 85 d8 b1 d8 ad d8 a8 d8 a7 20 f0 9f 9a 80';

    case 'text-to-binary':
      return 'Hello DevOmniTools! 🚀 Binary Converter';

    case 'binary-to-text':
    case 'binary-to-hex':
    case 'binary-to-base64':
      return '01001000 01100101 01101100 01101100 01101111 00100000 01010111 01101111 01110010 01101100 01100100'; // "Hello World"
    default:
      return '';
  }
}
