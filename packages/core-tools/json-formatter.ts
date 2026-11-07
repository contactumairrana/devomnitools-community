export interface JsonFormatOptions {
  indent?: number | '\t';
  sortKeys?: boolean;
  maxOutputBytes?: number;
}

export interface JsonStats {
  rawLength: number;
  formattedLength: number;
  lineCount: number;
  sizeBytes: number;
  savedBytes: number;
  compressionPercentage: number;
}

export interface BigIntDetectionResult {
  hasUnsafeIntegers: boolean;
  count: number;
  samples: string[];
}

export interface JsonFormatResult {
  success: boolean;
  output: string;
  error?: string;
  errorLocation?: {
    line: number;
    column: number;
  };
  stats?: JsonStats;
  bigIntDetection?: BigIntDetectionResult;
}

function calculateStats(raw: string, result: string): JsonStats {
  const rawLength = raw.length;
  const formattedLength = result.length;
  const lineCount = result ? result.split('\n').length : 0;
  const sizeBytes = new Blob([result]).size;
  const savedBytes = Math.max(0, rawLength - formattedLength);
  const compressionPercentage = rawLength > 0 ? Math.round((savedBytes / rawLength) * 100) : 0;

  return {
    rawLength,
    formattedLength,
    lineCount,
    sizeBytes,
    savedBytes,
    compressionPercentage
  };
}

// Lossless JSON AST Node definition
export type LosslessJsonNode =
  | { type: 'string'; value: string; raw: string }
  | { type: 'number'; raw: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'null' }
  | { type: 'array'; elements: LosslessJsonNode[] }
  | { type: 'object'; entries: { key: string; rawKey: string; value: LosslessJsonNode }[] };

export const MAX_JSON_DEPTH = 256;
export const MAX_JSON_NODES = 500000;
export const MAX_FORMATTED_OUTPUT_CHARS = 30 * 1024 * 1024;

class LosslessJsonParser {
  private pos = 0;
  private line = 1;
  private column = 1;
  private depth = 0;
  private nodeCount = 0;
  private readonly len: number;

  constructor(private readonly input: string) {
    this.len = input.length;
  }

  private error(message: string): never {
    const err = new Error(message) as any;
    err.line = this.line;
    err.column = this.column;
    throw err;
  }

  private peek(): string {
    return this.pos < this.len ? this.input[this.pos] : '';
  }

  private next(): string {
    if (this.pos >= this.len) return '';
    const ch = this.input[this.pos++];
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  private skipWhitespace(): void {
    while (this.pos < this.len) {
      const ch = this.input[this.pos];
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.next();
      } else {
        break;
      }
    }
  }

  public parse(): LosslessJsonNode {
    this.skipWhitespace();
    if (this.pos >= this.len) {
      this.error('Unexpected end of JSON input');
    }
    const node = this.parseValue();
    this.skipWhitespace();
    if (this.pos < this.len) {
      this.error(`Unexpected character '${this.input[this.pos]}' after JSON data`);
    }
    return node;
  }

  private parseValue(): LosslessJsonNode {
    this.skipWhitespace();
    if (this.pos >= this.len) {
      this.error('Unexpected end of JSON input');
    }

    this.nodeCount++;
    if (this.nodeCount > MAX_JSON_NODES) {
      this.error(`Maximum node budget of ${MAX_JSON_NODES.toLocaleString()} nodes exceeded`);
    }

    const ch = this.input[this.pos];
    if (ch === '{') return this.parseObject();
    if (ch === '[') return this.parseArray();
    if (ch === '"') return this.parseString();
    if (ch === 't' || ch === 'f') return this.parseBoolean();
    if (ch === 'n') return this.parseNull();
    if (ch === '-' || (ch >= '0' && ch <= '9')) return this.parseNumber();

    this.error(`Unexpected token '${ch}' in JSON`);
  }

  private parseObject(): LosslessJsonNode {
    if (this.depth >= MAX_JSON_DEPTH) {
      this.error(`Maximum nesting depth of ${MAX_JSON_DEPTH} exceeded`);
    }
    this.depth++;

    try {
      this.next(); // Consume '{'
      this.skipWhitespace();
      const entries: { key: string; rawKey: string; value: LosslessJsonNode }[] = [];

      if (this.peek() === '}') {
        this.next(); // Consume '}'
        return { type: 'object', entries };
      }

      while (this.pos < this.len) {
        this.skipWhitespace();
        if (this.peek() !== '"') {
          this.error(`Expected string key in object but found '${this.peek()}'`);
        }
        const keyNode = this.parseString();
        this.skipWhitespace();

        if (this.peek() !== ':') {
          this.error(`Expected ':' after key in object but found '${this.peek()}'`);
        }
        this.next(); // Consume ':'

        const valNode = this.parseValue();
        entries.push({ key: keyNode.value, rawKey: keyNode.raw, value: valNode });

        this.skipWhitespace();
        const nextChar = this.peek();
        if (nextChar === ',') {
          this.next();
          this.skipWhitespace();
          if (this.peek() === '}') {
            this.error('Trailing comma is not allowed in standard JSON');
          }
          if (this.pos >= this.len) {
            this.error('Unexpected end of JSON input after comma');
          }
        } else if (nextChar === '}') {
          this.next();
          return { type: 'object', entries };
        } else {
          this.error(`Expected ',' or '}' in object but found '${nextChar}'`);
        }
      }

      this.error("Expected '}' at end of JSON object");
    } finally {
      this.depth--;
    }
  }

  private parseArray(): LosslessJsonNode {
    if (this.depth >= MAX_JSON_DEPTH) {
      this.error(`Maximum nesting depth of ${MAX_JSON_DEPTH} exceeded`);
    }
    this.depth++;

    try {
      this.next(); // Consume '['
      this.skipWhitespace();
      const elements: LosslessJsonNode[] = [];

      if (this.peek() === ']') {
        this.next(); // Consume ']'
        return { type: 'array', elements };
      }

      while (this.pos < this.len) {
        const valNode = this.parseValue();
        elements.push(valNode);

        this.skipWhitespace();
        const nextChar = this.peek();
        if (nextChar === ',') {
          this.next();
          this.skipWhitespace();
          if (this.peek() === ']') {
            this.error('Trailing comma is not allowed in standard JSON');
          }
          if (this.pos >= this.len) {
            this.error('Unexpected end of JSON input after comma');
          }
        } else if (nextChar === ']') {
          this.next();
          return { type: 'array', elements };
        } else {
          this.error(`Expected ',' or ']' in array but found '${nextChar}'`);
        }
      }

      this.error("Expected ']' at end of JSON array");
    } finally {
      this.depth--;
    }
  }

  private parseString(): { type: 'string'; value: string; raw: string } {
    const startPos = this.pos;
    this.next(); // Consume opening '"'
    let val = '';

    while (this.pos < this.len) {
      const ch = this.next();
      if (ch === '"') {
        const raw = this.input.slice(startPos, this.pos);
        return { type: 'string', value: val, raw };
      }
      if (ch === '\\') {
        if (this.pos >= this.len) this.error('Unterminated string escape sequence');
        const esc = this.next();
        if (esc === '"') val += '"';
        else if (esc === '\\') val += '\\';
        else if (esc === '/') val += '/';
        else if (esc === 'b') val += '\b';
        else if (esc === 'f') val += '\f';
        else if (esc === 'n') val += '\n';
        else if (esc === 'r') val += '\r';
        else if (esc === 't') val += '\t';
        else if (esc === 'u') {
          const hex = this.input.slice(this.pos, this.pos + 4);
          if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
            this.error(`Invalid unicode escape sequence '\\u${hex}'`);
          }
          this.pos += 4;
          this.column += 4;
          val += String.fromCharCode(parseInt(hex, 16));
        } else {
          this.error(`Invalid escape character '\\${esc}'`);
        }
      } else if (ch.charCodeAt(0) < 0x20) {
        this.error(`Unescaped control character (0x${ch.charCodeAt(0).toString(16)}) in string`);
      } else {
        val += ch;
      }
    }

    this.error('Unterminated string literal');
  }

  private parseNumber(): LosslessJsonNode {
    const startPos = this.pos;
    if (this.peek() === '-') {
      this.next();
    }

    if (this.peek() === '0') {
      this.next();
    } else if (this.peek() >= '1' && this.peek() <= '9') {
      while (this.peek() >= '0' && this.peek() <= '9') {
        this.next();
      }
    } else {
      this.error('Invalid number format: expected digit');
    }

    if (this.peek() === '.') {
      this.next();
      if (this.peek() < '0' || this.peek() > '9') {
        this.error('Invalid number format: expected digit after decimal point');
      }
      while (this.peek() >= '0' && this.peek() <= '9') {
        this.next();
      }
    }

    if (this.peek() === 'e' || this.peek() === 'E') {
      this.next();
      if (this.peek() === '+' || this.peek() === '-') {
        this.next();
      }
      if (this.peek() < '0' || this.peek() > '9') {
        this.error('Invalid number format: expected digit in exponent');
      }
      while (this.peek() >= '0' && this.peek() <= '9') {
        this.next();
      }
    }

    const raw = this.input.slice(startPos, this.pos);
    return { type: 'number', raw };
  }

  private parseBoolean(): LosslessJsonNode {
    if (this.input.startsWith('true', this.pos)) {
      this.pos += 4;
      this.column += 4;
      return { type: 'boolean', value: true };
    }
    if (this.input.startsWith('false', this.pos)) {
      this.pos += 5;
      this.column += 5;
      return { type: 'boolean', value: false };
    }
    this.error(`Invalid boolean literal`);
  }

  private parseNull(): LosslessJsonNode {
    if (this.input.startsWith('null', this.pos)) {
      this.pos += 4;
      this.column += 4;
      return { type: 'null' };
    }
    this.error(`Invalid null literal`);
  }
}

class BoundedStringWriter {
  chunks: string[] = [];
  byteCount = 0;
  constructor(public maxBytes: number) {}
  
  append(str: string) {
    let utf8Bytes = 0;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c <= 0x7f) utf8Bytes++;
      else if (c <= 0x7ff) utf8Bytes += 2;
      else if (c >= 0xd800 && c <= 0xdbff && str.charCodeAt(i + 1) >= 0xdc00 && str.charCodeAt(i + 1) <= 0xdfff) { utf8Bytes += 4; i++; }
      else utf8Bytes += 3;
    }
    
    if (this.byteCount + utf8Bytes > this.maxBytes) {
      throw new Error(`Output exceeds maximum allowed size (${this.maxBytes} bytes)`);
    }
    this.byteCount += utf8Bytes;
    this.chunks.push(str);
  }
  
  toString() {
    return this.chunks.join('');
  }
}

function stringifyLossless(node: LosslessJsonNode, indentStr: string, sortKeys: boolean, writer: BoundedStringWriter, currentIndent = ''): void {
  switch (node.type) {
    case 'string':
      writer.append(JSON.stringify(node.value));
      return;
    case 'number':
      writer.append(node.raw);
      return;
    case 'boolean':
      writer.append(node.value ? 'true' : 'false');
      return;
    case 'null':
      writer.append('null');
      return;
    case 'array': {
      if (node.elements.length === 0) {
        writer.append('[]');
        return;
      }
      if (!indentStr) {
        writer.append('[');
        for (let i = 0; i < node.elements.length; i++) {
          if (i > 0) writer.append(',');
          stringifyLossless(node.elements[i], '', sortKeys, writer, '');
        }
        writer.append(']');
        return;
      }
      const nextIndent = currentIndent + indentStr;
      writer.append('[\n');
      for (let i = 0; i < node.elements.length; i++) {
        if (i > 0) writer.append(',\n');
        writer.append(nextIndent);
        stringifyLossless(node.elements[i], indentStr, sortKeys, writer, nextIndent);
      }
      writer.append('\n');
      writer.append(currentIndent);
      writer.append(']');
      return;
    }
    case 'object': {
      if (node.entries.length === 0) {
        writer.append('{}');
        return;
      }
      let entries = node.entries;
      if (sortKeys) {
        entries = [...entries].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      }
      if (!indentStr) {
        writer.append('{');
        for (let i = 0; i < entries.length; i++) {
          if (i > 0) writer.append(',');
          writer.append(JSON.stringify(entries[i].key));
          writer.append(':');
          stringifyLossless(entries[i].value, '', sortKeys, writer, '');
        }
        writer.append('}');
        return;
      }
      const nextIndent = currentIndent + indentStr;
      writer.append('{\n');
      for (let i = 0; i < entries.length; i++) {
        if (i > 0) writer.append(',\n');
        writer.append(nextIndent);
        writer.append(JSON.stringify(entries[i].key));
        writer.append(': ');
        stringifyLossless(entries[i].value, indentStr, sortKeys, writer, nextIndent);
      }
      writer.append('\n');
      writer.append(currentIndent);
      writer.append('}');
      return;
    }
  }
}

export function parseLosslessJson(jsonStr: string): { ast: LosslessJsonNode | null; error?: string; line?: number; column?: number } {
  try {
    const parser = new LosslessJsonParser(jsonStr);
    const ast = parser.parse();
    return { ast };
  } catch (err: any) {
    return {
      ast: null,
      error: err.message || 'Invalid JSON syntax',
      line: err.line || 1,
      column: err.column || 1
    };
  }
}

export const MAX_SAFE_PAYLOAD_CHARS = 25 * 1024 * 1024; // 25M characters (UTF-16 code units, ~25 MB ASCII)
export const MAX_SAFE_PAYLOAD_BYTES = MAX_SAFE_PAYLOAD_CHARS; // Backward compatibility alias

/**
 * Traverses a LosslessJsonNode AST and detects any 64-bit integer values
 * that exceed IEEE 754 safe bounds (corrupted by standard JSON.parse).
 */
export function detectUnsafeIntegers(ast: LosslessJsonNode): BigIntDetectionResult {
  const samples: string[] = [];
  let count = 0;

  function traverse(node: LosslessJsonNode) {
    if (node.type === 'number') {
      const raw = node.raw;
      if (!raw.includes('.') && !raw.includes('e') && !raw.includes('E')) {
        const isNegative = raw.startsWith('-');
        const digits = isNegative ? raw.slice(1) : raw;
        if (digits.length >= 16) {
          try {
            const bigVal = BigInt(raw);
            const maxSafe = BigInt(Number.MAX_SAFE_INTEGER);
            const minSafe = BigInt(Number.MIN_SAFE_INTEGER);
            if (bigVal > maxSafe || bigVal < minSafe) {
              count++;
              if (samples.length < 3) {
                samples.push(raw);
              }
            }
          } catch {
            // ignore malformed numbers
          }
        }
      }
    } else if (node.type === 'object') {
      for (const entry of node.entries) {
        traverse(entry.value);
      }
    } else if (node.type === 'array') {
      for (const element of node.elements) {
        traverse(element);
      }
    }
  }

  traverse(ast);
  return {
    hasUnsafeIntegers: count > 0,
    count,
    samples
  };
}

export function formatJson(input: string, options: JsonFormatOptions = { indent: 2 }): JsonFormatResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { success: true, output: '', stats: calculateStats('', '') };
  }

  if (trimmed.length > MAX_SAFE_PAYLOAD_CHARS || new Blob([trimmed]).size > MAX_SAFE_PAYLOAD_BYTES) {
    return {
      success: false,
      output: '',
      error: `Payload exceeds 25 MB safety ceiling (${(trimmed.length / (1024 * 1024)).toFixed(1)}M code units / characters, ~25 MB ASCII). To prevent browser tab termination, please process in smaller chunks or using CLI.`
    };
  }

  const { ast, error, line, column } = parseLosslessJson(trimmed);
  if (error || !ast) {
    return {
      success: false,
      output: '',
      error,
      errorLocation: line && column ? { line, column } : undefined
    };
  }

  if (options.indent !== undefined && options.indent !== '\t' && (!Number.isInteger(options.indent) || options.indent < 0 || options.indent > 10)) {
    return { success: false, output: '', error: 'Indent must be a whole number from 0 to 10, or a tab.' };
  }
  const indentValue = options.indent === '\t' ? '\t' : ' '.repeat(typeof options.indent === 'number' ? options.indent : 2);
  const sort = options.sortKeys ?? false;
  let output = '';
  try {
    const maxOutput = options.maxOutputBytes ?? MAX_FORMATTED_OUTPUT_CHARS;
    if (!Number.isInteger(maxOutput) || maxOutput < 1 || maxOutput > MAX_FORMATTED_OUTPUT_CHARS) throw new Error('Invalid output byte budget.');
    const writer = new BoundedStringWriter(maxOutput);
    stringifyLossless(ast, indentValue, sort, writer);
    output = writer.toString();
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : 'Output size exceeded limit.'
    };
  }

  const bigIntDetection = detectUnsafeIntegers(ast);

  return {
    success: true,
    output,
    stats: calculateStats(trimmed, output),
    bigIntDetection
  };
}

export function minifyJson(input: string, maxOutputBytes = MAX_FORMATTED_OUTPUT_CHARS): JsonFormatResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { success: true, output: '', stats: calculateStats('', '') };
  }

  if (trimmed.length > MAX_SAFE_PAYLOAD_CHARS || new Blob([trimmed]).size > MAX_SAFE_PAYLOAD_BYTES) {
    return {
      success: false,
      output: '',
      error: `Payload exceeds 25 MB safety ceiling (${(trimmed.length / (1024 * 1024)).toFixed(1)} MB).`
    };
  }

  const { ast, error, line, column } = parseLosslessJson(trimmed);
  if (error || !ast) {
    return {
      success: false,
      output: '',
      error,
      errorLocation: line && column ? { line, column } : undefined
    };
  }

  let output = '';
  try {
    if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > MAX_FORMATTED_OUTPUT_CHARS) throw new Error('Invalid output byte budget.');
    const writer = new BoundedStringWriter(maxOutputBytes);
    stringifyLossless(ast, '', false, writer);
    output = writer.toString();
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : 'Output size exceeded limit.'
    };
  }

  const bigIntDetection = detectUnsafeIntegers(ast);

  return {
    success: true,
    output,
    stats: calculateStats(trimmed, output),
    bigIntDetection
  };
}

export function validateJson(input: string): { isValid: boolean; error?: string; line?: number; column?: number } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { isValid: true };
  }

  if (trimmed.length > MAX_SAFE_PAYLOAD_CHARS || new Blob([trimmed]).size > MAX_SAFE_PAYLOAD_BYTES) {
    return {
      isValid: false,
      error: `Payload exceeds 25 MB safety ceiling (${(trimmed.length / (1024 * 1024)).toFixed(1)} MB).`
    };
  }

  const { ast, error, line, column } = parseLosslessJson(trimmed);
  if (error || !ast) {
    return { isValid: false, error, line, column };
  }
  return { isValid: true };
}
