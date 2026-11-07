/**
 * cURL Command to Code Converter Engine
 * 100% Client-Side Pure TypeScript Implementation
 */

export interface CurlOption {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  bodyType: 'none' | 'json' | 'form' | 'raw';
  authUser: string | null;
  authPassword: string | null;
  compressed: boolean;
  insecure: boolean;
  followRedirects: boolean;
}

export interface ConvertResult {
  isValid: boolean;
  parsed: CurlOption | null;
  fetch: string;
  axios: string;
  python: string;
  pythonHttpx: string;
  go: string;
  rust: string;
  error?: string;
}

export function tokenizeCurl(cmd: string): string[] {
  const normalized = cmd
    .replace(/\\\r\n/g, ' ')
    .replace(/\\\n/g, ' ')
    .trim();

  const tokens: string[] = [];
  let i = 0;
  const n = normalized.length;

  while (i < n) {
    while (i < n && /\s/.test(normalized[i])) i++;
    if (i >= n) break;

    const ch = normalized[i];
    let token = '';

    if (ch === "'") {
      i++;
      while (i < n && normalized[i] !== "'") {
        token += normalized[i++];
      }
      if (i >= n) throw new Error('Unterminated single quote');
      i++;
    } else if (ch === '"') {
      i++;
      while (i < n && normalized[i] !== '"') {
        if (normalized[i] === '\\' && i + 1 < n) {
          const next = normalized[i + 1];
          if (next === '"' || next === '\\' || next === '$' || next === String.fromCharCode(96)) {
            token += next;
            i += 2;
          } else {
            token += normalized[i++];
          }
        } else {
          token += normalized[i++];
        }
      }
      if (i >= n) throw new Error('Unterminated double quote');
      i++;
    } else {
      while (i < n && !/\s/.test(normalized[i])) {
        if (normalized[i] === '\\' && i + 1 < n) {
          token += normalized[i + 1];
          i += 2;
        } else {
          token += normalized[i++];
        }
      }
    }

    if (token.length > 0 || ch === "'" || ch === '"') {
      tokens.push(token);
    }
  }

  return tokens;
}

export function parseCurlTokens(tokens: string[]): CurlOption {
  const result: CurlOption = {
    method: 'GET',
    url: '',
    headers: {},
    body: null,
    bodyType: 'none',
    authUser: null,
    authPassword: null,
    compressed: false,
    insecure: false,
    followRedirects: false,
  };

  let i = 0;
  if (tokens[0]?.toLowerCase() === 'curl') i = 1;

  let hasExplicitMethod = false;
  let dataInQuery = false;

  while (i < tokens.length) {
    const tok = tokens[i];

    const eqIdx = tok.indexOf('=');
    let flag = tok;
    let inlineVal: string | null = null;

    if (eqIdx > 0 && tok.startsWith('-')) {
      flag = tok.slice(0, eqIdx);
      inlineVal = tok.slice(eqIdx + 1);
    }

    const getValue = (): string => {
      if (inlineVal !== null) return inlineVal;
      return tokens[++i] ?? '';
    };

    if (flag === '-X' || flag === '--request') {
      result.method = getValue().toUpperCase();
      hasExplicitMethod = true;
    } else if (flag === '-H' || flag === '--header') {
      const raw = getValue();
      const colonIdx = raw.indexOf(':');
      if (colonIdx > 0) {
        const hName = raw.slice(0, colonIdx).trim().toLowerCase();
        const hVal = raw.slice(colonIdx + 1).trim();
        result.headers[hName] = hVal;
      }
    } else if (flag === '-d' || flag === '--data' || flag === '--data-raw' || flag === '--data-binary') {
      const rawBody = getValue();
      result.body = rawBody;
      const ct = result.headers['content-type'] ?? '';
      if (ct.includes('application/json') || rawBody.trimStart().startsWith('{') || rawBody.trimStart().startsWith('[')) {
        result.bodyType = 'json';
      } else if (ct.includes('application/x-www-form-urlencoded') || (rawBody.includes('=') && !rawBody.trimStart().startsWith('{'))) {
        result.bodyType = 'form';
      } else {
        result.bodyType = 'raw';
      }
      if (!hasExplicitMethod && result.method === 'GET') {
        result.method = 'POST';
      }
    } else if (flag === '--data-urlencode') {
      const val = getValue();
      result.body = result.body ? result.body + '&' + val : val;
      result.bodyType = 'form';
      if (!hasExplicitMethod && result.method === 'GET') result.method = 'POST';
    } else if (flag === '-u' || flag === '--user') {
      const creds = getValue();
      const sepIdx = creds.indexOf(':');
      if (sepIdx > 0) {
        result.authUser = creds.slice(0, sepIdx);
        result.authPassword = creds.slice(sepIdx + 1);
      } else {
        result.authUser = creds;
        result.authPassword = '';
      }
    } else if (flag === '-A' || flag === '--user-agent') {
      result.headers['user-agent'] = getValue();
    } else if (flag === '--url') {
      result.url = getValue();
    } else if (flag === '--compressed') {
      result.compressed = true;
    } else if (flag === '-k' || flag === '--insecure') {
      result.insecure = true;
    } else if (flag === '-L' || flag === '--location') {
      result.followRedirects = true;
    } else if (flag === '-G' || flag === '--get') {
      result.method = 'GET';
      hasExplicitMethod = true;
      dataInQuery = true;
    } else if (flag === '-I' || flag === '--head') {
      result.method = 'HEAD';
      hasExplicitMethod = true;
    } else if (!tok.startsWith('-')) {
      if (!result.url) result.url = tok;
      else throw new Error('Only one URL per command is supported.');
    } else {
      throw new Error(`Unsupported cURL option: ${flag}`);
    }

    i++;
  }
  if (dataInQuery && result.body !== null) {
    const url = new URL(result.url);
    const query = result.body;
    url.search = url.search ? url.search + '&' + query : '?' + query;
    result.url = url.toString();
    result.body = null;
    result.bodyType = 'none';
  }

  if (result.body && result.bodyType === 'json' && !result.headers['content-type']) {
    result.headers['content-type'] = 'application/json';
  }
  if (result.body && result.bodyType === 'form' && !result.headers['content-type']) {
    result.headers['content-type'] = 'application/x-www-form-urlencoded';
  }

  if (result.authUser && !result.headers['authorization']) {
    const bytes = new TextEncoder().encode(result.authUser + ':' + (result.authPassword ?? ''));
    const encoded = btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join(''));
    result.headers['authorization'] = 'Basic ' + encoded;
  }

  return result;
}

export function convertCurl(rawCmd: string): ConvertResult {
  const trimmed = rawCmd.trim();
  if (!trimmed) {
    return { isValid: false, parsed: null, fetch: '', axios: '', python: '', pythonHttpx: '', go: '', rust: '', error: 'Empty input' };
  }

  let tokens: string[];
  try {
    tokens = tokenizeCurl(trimmed);
  } catch {
    return { isValid: false, parsed: null, fetch: '', axios: '', python: '', pythonHttpx: '', go: '', rust: '', error: 'Failed to tokenize command' };
  }

  if (!tokens.length) {
    return { isValid: false, parsed: null, fetch: '', axios: '', python: '', pythonHttpx: '', go: '', rust: '', error: 'No valid tokens found' };
  }
  if (tokens[0].toLowerCase() !== 'curl') {
    return { isValid:false, parsed:null, fetch:'', axios:'', python:'', pythonHttpx:'', go:'', rust:'', error:'Enter a command beginning with curl.' };
  }

  let parsed: CurlOption;
  try { parsed = parseCurlTokens(tokens); }
  catch (error) {
    return {isValid:false, parsed:null, fetch:'', axios:'', python:'', pythonHttpx:'', go:'', rust:'', error:error instanceof Error ? error.message : 'Invalid cURL command'};
  }

  if (!parsed.url) {
    return { isValid: false, parsed, fetch: '', axios: '', python: '', pythonHttpx: '', go: '', rust: '', error: 'No URL found in cURL command' };
  }
  try {
    const url = new URL(parsed.url);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported URL');
  } catch {
    return { isValid:false, parsed, fetch:'', axios:'', python:'', pythonHttpx:'', go:'', rust:'', error:'Use an absolute HTTP or HTTPS URL.' };
  }
  if (!/^[A-Z]+$/.test(parsed.method)) {
    return { isValid:false, parsed, fetch:'', axios:'', python:'', pythonHttpx:'', go:'', rust:'', error:'Invalid HTTP method.' };
  }

  return {
    isValid: true,
    parsed,
    fetch: generateFetch(parsed),
    axios: generateAxios(parsed),
    python: generatePython(parsed),
    pythonHttpx: generatePythonHttpx(parsed),
    go: generateGo(parsed),
    rust: generateRust(parsed),
  };
}

function escStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t');
}

function escStrD(s: string): string {
  return JSON.stringify(s).slice(1,-1);
}

function headersLiteral(headers: Record<string, string>, indent = '  '): string {
  const entries = Object.entries(headers);
  if (!entries.length) return '{}';
  const lines = entries.map(([k, v]) => indent + "  '" + k + "': '" + escStr(v) + "'");
  return '{\n' + lines.join(',\n') + '\n' + indent + '}';
}

function generateFetch(opt: CurlOption): string {
  const lines: string[] = [];
  const hasHeaders = Object.keys(opt.headers).length > 0;
  const hasBody = opt.body !== null;

  lines.push('// JavaScript — Fetch API (Native, ES2020+)');
  lines.push('const response = await fetch(');
  lines.push("  '" + escStr(opt.url) + "',");
  lines.push('  {');
  lines.push("    method: '" + opt.method + "',");
  if (hasHeaders) {
    lines.push('    headers: ' + headersLiteral(opt.headers, '    ') + ',');
  }
  if (hasBody) {
    lines.push("    body: '" + escStr(opt.body!) + "',");
  }
  lines.push('  }');
  lines.push(');');
  lines.push('');
  if (opt.method === 'HEAD') {
    lines.push('console.log(response.status, Object.fromEntries(response.headers));');
  } else {
    lines.push('// Read the response as text; convert to JSON only if your API returns JSON.');
    lines.push('const data = await response.text();');
    lines.push('console.log(data);');
  }

  return lines.join('\n');
}

function generateAxios(opt: CurlOption): string {
  const lines: string[] = [];
  const hasHeaders = Object.keys(opt.headers).length > 0;
  const hasBody = opt.body !== null;

  lines.push('// JavaScript — Axios (v1.x)');
  lines.push("import axios from 'axios';");
  lines.push('');
  lines.push('const config = {');
  lines.push("  method: '" + opt.method.toLowerCase() + "',");
  lines.push("  url: '" + escStr(opt.url) + "',");
  if (hasHeaders) {
    lines.push('  headers: ' + headersLiteral(opt.headers) + ',');
  }
  if (hasBody) {
    // Keep the original bytes: parsing JSON here could silently round 64-bit IDs.
    lines.push("  data: '" + escStr(opt.body!) + "',");
  }
  lines.push('};');
  lines.push('');
  lines.push('const response = await axios(config);');
  lines.push(opt.method === 'HEAD' ? 'console.log(response.status, response.headers);' : 'console.log(response.data);');

  return lines.join('\n');
}

function generatePython(opt: CurlOption): string {
  const lines: string[] = [];
  const hasHeaders = Object.keys(opt.headers).length > 0;
  const hasBody = opt.body !== null;

  lines.push('# Python — requests library (pip install requests)');
  lines.push('import requests');
  if (hasBody && opt.bodyType === 'json') lines.push('import json');
  lines.push('');

  if (hasHeaders) {
    lines.push('headers = {');
    for (const [k, v] of Object.entries(opt.headers)) {
      lines.push("    '" + escStr(k) + "': '" + escStr(v) + "',");
    }
    lines.push('}');
    lines.push('');
  }

  if (hasBody) {
    if (opt.bodyType === 'json') {
      try {
        JSON.parse(opt.body!);
        lines.push('payload = json.loads(' + JSON.stringify(opt.body!) + ')');
        lines.push('');
      } catch {
        lines.push("payload = '" + escStr(opt.body!) + "'");
        lines.push('');
      }
    } else {
      lines.push("payload = '" + escStr(opt.body!) + "'");
      lines.push('');
    }
  }

  const method = opt.method.toLowerCase();
  const pythonMethod = ['get','post','put','patch','delete','head','options'].includes(method) ? method : 'request';
  const methodArgument = pythonMethod === 'request' ? JSON.stringify(opt.method) + ', ' : '';
  const headersArg = hasHeaders ? ', headers=headers' : '';
  const verifyArg = opt.insecure ? ', verify=False' : '';

  if (hasBody && opt.bodyType === 'json') {
    lines.push('response = requests.' + pythonMethod + '(');
    lines.push("    " + methodArgument + "'" + escStr(opt.url) + "'" + headersArg + ',');
    lines.push('    json=payload' + verifyArg);
    lines.push(')');
  } else if (hasBody) {
    lines.push('response = requests.' + pythonMethod + '(');
    lines.push("    " + methodArgument + "'" + escStr(opt.url) + "'" + headersArg + ',');
    lines.push('    data=payload' + verifyArg);
    lines.push(')');
  } else {
    lines.push("response = requests." + pythonMethod + "(" + methodArgument + "'" + escStr(opt.url) + "'" + headersArg + verifyArg + ')');
  }

  lines.push('');
  lines.push('print(response.status_code)');
  lines.push(opt.method === 'HEAD' ? 'print(dict(response.headers))' : 'print(response.text)');

  return lines.join('\n');
}

function generateGo(opt: CurlOption): string {
  const lines: string[] = [];
  const hasBody = opt.body !== null;
  const hasHeaders = Object.keys(opt.headers).length > 0;

  lines.push('// Go — net/http standard library');
  lines.push('package main');
  lines.push('');
  lines.push('import (');
  lines.push('\t"fmt"');
  if (hasBody) lines.push('\t"strings"');
  lines.push('\t"io"');
  lines.push('\t"net/http"');
  lines.push(')');
  lines.push('');
  lines.push('func main() {');

  if (hasBody) {
    const safeBody = escStrD(opt.body!);
    lines.push('\tbody := strings.NewReader("' + safeBody + '")');
    lines.push('');
  }

  const bodyArg = hasBody ? 'body' : 'nil';
  lines.push('\treq, err := http.NewRequest("' + opt.method + '", "' + escStrD(opt.url) + '", ' + bodyArg + ')');
  lines.push('\tif err != nil {');
  lines.push('\t\tpanic(err)');
  lines.push('\t}');
  lines.push('');

  if (hasHeaders) {
    for (const [k, v] of Object.entries(opt.headers)) {
      lines.push('\treq.Header.Set("' + escStrD(k) + '", "' + escStrD(v) + '")');
    }
    lines.push('');
  }

  lines.push('\tclient := &http.Client{}');
  lines.push('\tres, err := client.Do(req)');
  lines.push('\tif err != nil {');
  lines.push('\t\tpanic(err)');
  lines.push('\t}');
  lines.push('\tdefer res.Body.Close()');
  lines.push('');
  lines.push('\tbody2, _ := io.ReadAll(res.Body)');
  lines.push('\tfmt.Println(res.StatusCode)');
  lines.push('\tfmt.Println(string(body2))');
  lines.push('}');

  return lines.join('\n');
}

export function generatePythonHttpx(opt: CurlOption): string {
  const lines: string[] = [];
  const hasHeaders = Object.keys(opt.headers).length > 0;
  const hasBody = opt.body !== null;

  lines.push('# Python — HTTPX library (pip install httpx)');
  lines.push('import httpx');
  if (hasBody && opt.bodyType === 'json') lines.push('import json');
  lines.push('');

  if (hasHeaders) {
    lines.push('headers = {');
    for (const [k, v] of Object.entries(opt.headers)) {
      lines.push("    '" + escStr(k) + "': '" + escStr(v) + "',");
    }
    lines.push('}');
    lines.push('');
  }

  if (hasBody) {
    if (opt.bodyType === 'json') {
      try {
        JSON.parse(opt.body!);
        lines.push('payload = json.loads(' + JSON.stringify(opt.body!) + ')');
        lines.push('');
      } catch {
        lines.push("payload = '" + escStr(opt.body!) + "'");
        lines.push('');
      }
    } else {
      lines.push("payload = '" + escStr(opt.body!) + "'");
      lines.push('');
    }
  }

  const method = opt.method.toLowerCase();
  const headersArg = hasHeaders ? ', headers=headers' : '';
  const clientArgs = opt.insecure ? 'verify=False' : '';

  lines.push('with httpx.Client(' + clientArgs + ') as client:');
  if (hasBody && opt.bodyType === 'json') {
    lines.push("    response = client." + method + "(");
    lines.push("        '" + escStr(opt.url) + "'" + headersArg + ',');
    lines.push('        json=payload');
    lines.push('    )');
  } else if (hasBody) {
    lines.push("    response = client." + method + "(");
    lines.push("        '" + escStr(opt.url) + "'" + headersArg + ',');
    lines.push('        content=payload');
    lines.push('    )');
  } else {
    lines.push("    response = client." + method + "('" + escStr(opt.url) + "'" + headersArg + ')');
  }

  lines.push('');
  lines.push('    print(response.status_code)');
  lines.push(opt.method === 'HEAD' ? '    print(dict(response.headers))' : '    print(response.text)');

  return lines.join('\n');
}

export function generateRust(opt: CurlOption): string {
  const lines: string[] = [];
  const hasHeaders = Object.keys(opt.headers).length > 0;
  const hasBody = opt.body !== null;

  lines.push('// Rust — reqwest (Cargo.toml: reqwest = { version = "0.12", features = ["blocking", "json"] })');
  lines.push('use reqwest::blocking::Client;');
  if (hasHeaders) {
    lines.push('use reqwest::header::{HeaderMap, HeaderName, HeaderValue};');
  }
  lines.push('');
  lines.push('fn main() -> Result<(), Box<dyn std::error::Error>> {');

  if (opt.insecure) {
    lines.push('    let client = Client::builder()');
    lines.push('        .danger_accept_invalid_certs(true)');
    lines.push('        .build()?;');
  } else {
    lines.push('    let client = Client::new();');
  }
  lines.push('');

  if (hasHeaders) {
    lines.push('    let mut headers = HeaderMap::new();');
    for (const [k, v] of Object.entries(opt.headers)) {
      lines.push('    headers.insert(');
      lines.push('        "' + escStrD(k.toLowerCase()) + '".parse::<HeaderName>()?,');
      lines.push('        "' + escStrD(v) + '".parse::<HeaderValue>()?,');
      lines.push('    );');
    }
    lines.push('');
  }

  const methodUpper = opt.method.toUpperCase();
  const reqwestMethod = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD'].includes(methodUpper)
    ? methodUpper.toLowerCase()
    : 'request';

  if (reqwestMethod === 'request') {
    lines.push('    let mut req = client.request(reqwest::Method::from_bytes(b"' + methodUpper + '")?, "' + escStrD(opt.url) + '");');
  } else {
    lines.push('    let mut req = client.' + reqwestMethod + '("' + escStrD(opt.url) + '");');
  }

  if (hasHeaders) {
    lines.push('    req = req.headers(headers);');
  }

  if (hasBody) {
    lines.push('    req = req.body(r#"' + opt.body!.replace(/"#/g, '" #') + '"#);');
  }

  lines.push('');
  lines.push('    let response = req.send()?;');
  lines.push('    println!("Status: {}", response.status());');
  if (opt.method === 'HEAD') {
    lines.push('    println!("Headers: {:#?}", response.headers());');
  } else {
    lines.push('    println!("Response Body: {}", response.text()?);');
  }
  lines.push('');
  lines.push('    Ok(())');
  lines.push('}');

  return lines.join('\n');
}
