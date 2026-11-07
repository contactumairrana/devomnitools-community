// src/lib/tools/svg-to-font.ts
// @ts-ignore
import svg2ttf from 'svg2ttf';

export interface SvgGlyphItem {
  id: string;
  char: string;
  filename: string;
  svgContent: string;
  pathData: string;
  viewBox?: { width: number; height: number };
}

export interface FontBuildOptions {
  fontName?: string;
  fontFamily?: string;
  unitsPerEm?: number;
  ascent?: number;
  descent?: number;
}

export interface FontBuildResult {
  ttfBuffer: Uint8Array;
  ttfBlobUrl?: string;
  cssFontFace: string;
  glyphsCount: number;
  svgFontXml: string;
}

/**
 * Extracts path data (d attribute) and viewBox dimensions from raw SVG string.
 */
export function parseSvgPath(svgContent: string): { pathData: string; width: number; height: number } {
  if (!svgContent) {
    return { pathData: '', width: 1000, height: 1000 };
  }

  // Extract viewBox if present: viewBox="minX minY width height"
  let width = 1000;
  let height = 1000;

  const viewBoxMatch = svgContent.match(/viewBox=["']\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*["']/i);
  if (viewBoxMatch) {
    const vbW = parseFloat(viewBoxMatch[3]);
    const vbH = parseFloat(viewBoxMatch[4]);
    if (!isNaN(vbW) && vbW > 0) width = vbW;
    if (!isNaN(vbH) && vbH > 0) height = vbH;
  } else {
    // Check width / height attributes
    const wMatch = svgContent.match(/width=["']([\d.]+)p?x?["']/i);
    const hMatch = svgContent.match(/height=["']([\d.]+)p?x?["']/i);
    if (wMatch) {
      const w = parseFloat(wMatch[1]);
      if (!isNaN(w) && w > 0) width = w;
    }
    if (hMatch) {
      const h = parseFloat(hMatch[1]);
      if (!isNaN(h) && h > 0) height = h;
    }
  }

  // Extract all path d attributes
  const pathRegex = /<path[^>]*\bd=["']([^"']+)["'][^>]*>/gi;
  const pathParts: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = pathRegex.exec(svgContent)) !== null) {
    if (match[1] && match[1].trim()) {
      pathParts.push(match[1].trim());
    }
  }

  return {
    pathData: pathParts.join(' '),
    width,
    height
  };
}

/**
 * Generates an SVG 1.1 Font XML string containing the provided glyphs.
 */
export function buildSvgFontXml(
  glyphs: Array<{ char: string; pathData: string; name?: string }>,
  options: FontBuildOptions = {}
): string {
  const {
    fontName = 'BandFont',
    fontFamily = 'BandFont',
    unitsPerEm = 1000,
    ascent = 800,
    descent = -200
  } = options;

  let glyphTags = '';
  // Include default space glyph
  glyphTags += `  <glyph unicode=" " horiz-adv-x="${Math.round(unitsPerEm / 2)}" d="" />\n`;

  for (const g of glyphs) {
    if (!g.char) continue;
    const cp = g.char.codePointAt(0);
    const safeChar = cp !== undefined && cp > 127
      ? `&#x${cp.toString(16).toUpperCase()};`
      : g.char
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
    const safeName = (g.name || g.char).replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeD = (g.pathData || '').replace(/"/g, "'");

    glyphTags += `  <glyph unicode="${safeChar}" glyph-name="${safeName}" horiz-adv-x="${unitsPerEm}" d="${safeD}" />\n`;
  }

  return `<?xml version="1.0" standalone="no"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg">
<defs>
<font id="${fontName}" horiz-adv-x="${unitsPerEm}">
  <font-face font-family="${fontFamily}" units-per-em="${unitsPerEm}" ascent="${ascent}" descent="${descent}" />
  <missing-glyph horiz-adv-x="${unitsPerEm}" d="" />
${glyphTags}</font>
</defs>
</svg>`;
}

/**
 * Compiles SVG glyphs into a TrueType Font (TTF) binary Uint8Array and CSS @font-face string.
 */
export function compileSvgToFont(
  glyphs: Array<{ char: string; pathData: string; name?: string }>,
  options: FontBuildOptions = {}
): FontBuildResult {
  const fontName = options.fontName || 'CustomFont';
  const fontFamily = options.fontFamily || fontName;
  const svgFontXml = buildSvgFontXml(glyphs, options);

  const ttfResult = svg2ttf(svgFontXml, {});
  const ttfBuffer = new Uint8Array(ttfResult.buffer);

  // Convert buffer to base64 for CSS @font-face
  let binary = '';
  for (let i = 0; i < ttfBuffer.byteLength; i++) {
    binary += String.fromCharCode(ttfBuffer[i]);
  }
  const base64Ttf = typeof btoa === 'function' 
    ? btoa(binary) 
    : Buffer.from(ttfBuffer).toString('base64');

  const cssFontFace = `@font-face {
  font-family: '${fontFamily}';
  src: url('data:font/truetype;charset=utf-8;base64,${base64Ttf}') format('truetype');
  font-weight: normal;
  font-style: normal;
}`;

  return {
    ttfBuffer,
    cssFontFace,
    glyphsCount: glyphs.length,
    svgFontXml
  };
}

/**
 * Formats a character into standard Unicode hex representation (e.g. U+EA01 or U+0041).
 */
export function toHexCodePoint(char: string): string {
  if (!char) return 'U+0000';
  const cp = char.codePointAt(0);
  if (cp === undefined) return 'U+0000';
  return 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Generates an array of sequential Unicode characters starting from a specified hex code point.
 * Defaults to 'EA01' (standard IcoMoon / FontAwesome Private Use Area).
 */
export function assignUnicodeRange(count: number, startHex: string = 'EA01'): string[] {
  let start = parseInt(startHex.replace(/^U\+/i, ''), 16);
  if (isNaN(start) || start < 0) {
    start = 0xEA01;
  }
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(String.fromCodePoint(start + i));
  }
  return result;
}

export interface IcoMoonImportResult {
  success: boolean;
  fontName?: string;
  glyphs: SvgGlyphItem[];
  error?: string;
}

/**
 * Parses and converts an IcoMoon selection.json project file into SvgGlyphItem records.
 * Enables zero-friction migration and full compatibility with IcoMoon font projects.
 */
export function importIcoMoonJson(jsonContent: string): IcoMoonImportResult {
  if (!jsonContent || !jsonContent.trim()) {
    return { success: false, glyphs: [], error: 'Empty JSON content provided' };
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (err) {
    return {
      success: false,
      glyphs: [],
      error: `Invalid JSON format: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  const icons = Array.isArray(parsed.icons) ? parsed.icons : [];
  if (icons.length === 0) {
    return {
      success: false,
      glyphs: [],
      error: 'No icons found in selection.json. Ensure the file contains an "icons" array.'
    };
  }

  const fontName = parsed.preferences?.fontPref?.metadata?.fontFamily || parsed.metadata?.name || 'IcoMoonFont';
  const glyphs: SvgGlyphItem[] = [];

  for (let i = 0; i < icons.length; i++) {
    const item = icons[i];
    const iconData = item.icon || {};
    const paths = Array.isArray(iconData.paths) ? iconData.paths : [];
    const pathData = paths.join(' ').trim();
    if (!pathData) continue;

    const width = iconData.width || 1024;
    const height = iconData.height || 1024;
    const name = item.properties?.name || `icon-${i + 1}`;
    const code = item.properties?.code;
    const char = typeof code === 'number' && code > 0
      ? String.fromCodePoint(code)
      : String.fromCodePoint(0xEA01 + i);

    const svgContent = `<svg viewBox="0 0 ${width} ${height}"><path d="${pathData}" /></svg>`;

    glyphs.push({
      id: `icomoon-${i + 1}-${name}`,
      char,
      filename: `${name}.svg`,
      svgContent,
      pathData,
      viewBox: { width, height }
    });
  }

  return {
    success: glyphs.length > 0,
    fontName,
    glyphs,
    error: glyphs.length === 0 ? 'No valid SVG path data extracted from icon records' : undefined
  };
}
