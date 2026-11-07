/**
 * Unix Timestamp & Epoch Time Converter Engine
 * 100% Client-Side Pure TypeScript Implementation
 * 
 * Features:
 * - Intelligent detection of 10-digit seconds vs 13-digit milliseconds
 * - Strict Intl.DateTimeFormat timezone parity (User Local vs UTC)
 * - ISO 8601 and RFC 2822 formatting
 * - Relative time calculations ("X ago", "in Y")
 * - Date-to-Epoch & Epoch-to-Date conversions
 * - Day of Year and Leap Year calculations
 */

export type TimestampUnit = 'auto' | 'seconds' | 'milliseconds';

export interface EpochConversionResult {
  isValid: boolean;
  timestampSeconds: number;
  timestampMs: number;
  detectedUnit: 'seconds' | 'milliseconds';
  localFormatted: string;
  utcFormatted: string;
  isoFormatted: string;
  relativeFormatted: string;
  dayOfWeek: string;
  dayOfYear: number;
  isLeapYear: boolean;
  error?: string;
}

export interface DateToEpochResult {
  isValid: boolean;
  timestampSeconds: number;
  timestampMs: number;
  isoFormatted: string;
  utcFormatted: string;
  localFormatted: string;
  error?: string;
}

/**
 * Detects whether a numeric timestamp is in seconds (typically 10 digits) or milliseconds (typically 13 digits)
 */
export function detectTimestampUnit(val: number | string): 'seconds' | 'milliseconds' {
  const numStr = String(val).replace(/[^0-9-]/g, '');
  const num = Number(numStr);
  if (isNaN(num)) return 'seconds';

  // In the 21st century:
  // Seconds: ~1,000,000,000 to ~9,999,999,999 (10 digits)
  // Milliseconds: ~1,000,000,000,000 to ~9,999,999,999,999 (13 digits)
  // Cutoff threshold: 300,000,000,000 (year 11468 in seconds, or year 1979 in ms)
  if (Math.abs(num) > 30000000000) {
    return 'milliseconds';
  }
  return 'seconds';
}

/**
 * Calculates day of the year (1 - 366)
 */
export function getDayOfYear(date: Date): number {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay) + 1;
}

/**
 * Checks if a given year is a leap year
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Formats a relative human string (e.g., "5 minutes ago", "in 2 days")
 */
export function formatRelativeTime(targetDate: Date, baseDate = new Date()): string {
  const diffMs = targetDate.getTime() - baseDate.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);

  const isFuture = diffSec > 0;
  const prefix = isFuture ? 'in ' : '';
  const suffix = isFuture ? '' : ' ago';

  if (absSec < 5) return 'just now';
  if (absSec < 60) return `${prefix}${absSec} seconds${suffix}`;
  
  const minutes = Math.floor(absSec / 60);
  if (minutes < 60) return `${prefix}${minutes} minute${minutes === 1 ? '' : 's'}${suffix}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${prefix}${hours} hour${hours === 1 ? '' : 's'}${suffix}`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${prefix}${days} day${days === 1 ? '' : 's'}${suffix}`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${prefix}${months} month${months === 1 ? '' : 's'}${suffix}`;

  const years = Math.floor(days / 365);
  return `${prefix}${years} year${years === 1 ? '' : 's'}${suffix}`;
}

/**
 * Converts a Unix epoch timestamp (seconds or ms) to date representations
 */
export function convertEpochToDate(
  input: string | number,
  unit: TimestampUnit = 'auto'
): EpochConversionResult {
  const rawStr = String(input).trim();
  if (!rawStr) {
    return {
      isValid: false,
      timestampSeconds: 0,
      timestampMs: 0,
      detectedUnit: 'seconds',
      localFormatted: '',
      utcFormatted: '',
      isoFormatted: '',
      relativeFormatted: '',
      dayOfWeek: '',
      dayOfYear: 0,
      isLeapYear: false,
      error: 'Empty input',
    };
  }

  const num = Number(rawStr);
  if (isNaN(num)) {
    return {
      isValid: false,
      timestampSeconds: 0,
      timestampMs: 0,
      detectedUnit: 'seconds',
      localFormatted: '',
      utcFormatted: '',
      isoFormatted: '',
      relativeFormatted: '',
      dayOfWeek: '',
      dayOfYear: 0,
      isLeapYear: false,
      error: 'Invalid numeric timestamp',
    };
  }

  const detected = unit === 'auto' ? detectTimestampUnit(num) : unit;
  const timestampMs = detected === 'seconds' ? Math.round(num * 1000) : Math.round(num);
  const timestampSeconds = detected === 'seconds' ? Math.round(num) : Math.floor(num / 1000);

  const date = new Date(timestampMs);
  if (isNaN(date.getTime())) {
    return {
      isValid: false,
      timestampSeconds: 0,
      timestampMs: 0,
      detectedUnit: detected,
      localFormatted: '',
      utcFormatted: '',
      isoFormatted: '',
      relativeFormatted: '',
      dayOfWeek: '',
      dayOfYear: 0,
      isLeapYear: false,
      error: 'Timestamp out of valid date range',
    };
  }

  // Format via Intl.DateTimeFormat
  const localFormatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'long',
  });

  const utcFormatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone: 'UTC',
  });

  const dayOfWeekFormatter = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });

  return {
    isValid: true,
    timestampSeconds,
    timestampMs,
    detectedUnit: detected,
    localFormatted: localFormatter.format(date),
    utcFormatted: utcFormatter.format(date),
    isoFormatted: date.toISOString(),
    relativeFormatted: formatRelativeTime(date),
    dayOfWeek: dayOfWeekFormatter.format(date),
    dayOfYear: getDayOfYear(date),
    isLeapYear: isLeapYear(date.getUTCFullYear()),
  };
}

/**
 * Converts a human date or date-time-local string to Unix timestamps
 */
export function convertDateToEpoch(
  dateInput: string | Date,
  timezone: 'local' | 'utc' = 'local'
): DateToEpochResult {
  if (!dateInput) {
    return {
      isValid: false,
      timestampSeconds: 0,
      timestampMs: 0,
      isoFormatted: '',
      utcFormatted: '',
      localFormatted: '',
      error: 'Empty date input',
    };
  }

  let date: Date;

  if (dateInput instanceof Date) {
    date = dateInput;
  } else if (timezone === 'utc' && typeof dateInput === 'string' && !dateInput.endsWith('Z')) {
    // If user specified UTC and string has no timezone, append Z
    date = new Date(`${dateInput}Z`);
  } else {
    date = new Date(dateInput);
  }

  if (isNaN(date.getTime())) {
    return {
      isValid: false,
      timestampSeconds: 0,
      timestampMs: 0,
      isoFormatted: '',
      utcFormatted: '',
      localFormatted: '',
      error: 'Invalid date string',
    };
  }

  const timestampMs = date.getTime();
  const timestampSeconds = Math.floor(timestampMs / 1000);

  const localFormatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'long',
  });

  const utcFormatter = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'full',
    timeStyle: 'long',
    timeZone: 'UTC',
  });

  return {
    isValid: true,
    timestampSeconds,
    timestampMs,
    isoFormatted: date.toISOString(),
    utcFormatted: utcFormatter.format(date),
    localFormatted: localFormatter.format(date),
  };
}

// ─── 64-Bit Snowflake ID Decoder (Distributed Systems) ──────────────────────

export type SnowflakePlatform = 'discord' | 'twitter' | 'instagram' | 'mastodon' | 'custom';

export interface SnowflakePlatformConfig {
  id: SnowflakePlatform;
  label: string;
  epochMs: bigint;
  shift: bigint;
  workerMask?: bigint;
  workerShift?: bigint;
  processMask?: bigint;
  processShift?: bigint;
  sequenceMask?: bigint;
}

export const SNOWFLAKE_PLATFORMS: Record<SnowflakePlatform, SnowflakePlatformConfig> = {
  discord: {
    id: 'discord',
    label: 'Discord',
    epochMs: 1420070400000n, // 2015-01-01T00:00:00.000Z
    shift: 22n,
    workerMask: 0x3E0000n, // bits 17-21 (5 bits)
    workerShift: 17n,
    processMask: 0x1F000n,  // bits 12-16 (5 bits)
    processShift: 12n,
    sequenceMask: 0xFFFn,   // bits 0-11 (12 bits)
  },
  twitter: {
    id: 'twitter',
    label: 'Twitter / X',
    epochMs: 1288834974657n, // 2010-11-04T01:42:54.657Z
    shift: 22n,
    workerMask: 0x3E0000n, // datacenter ID (5 bits)
    workerShift: 17n,
    processMask: 0x1F000n,  // worker ID (5 bits)
    processShift: 12n,
    sequenceMask: 0xFFFn,   // sequence (12 bits)
  },
  instagram: {
    id: 'instagram',
    label: 'Instagram',
    epochMs: 1314220800000n, // 2011-08-25T00:00:00.000Z
    shift: 22n,
    workerMask: 0x3FFE00n, // 13 bits shard
    workerShift: 10n,
    processMask: 0n,
    processShift: 0n,
    sequenceMask: 0x3FFn,   // 10 bits sequence
  },
  mastodon: {
    id: 'mastodon',
    label: 'Mastodon',
    epochMs: 1546300800000n, // 2019-01-01T00:00:00.000Z
    shift: 16n,
    workerMask: 0n,
    workerShift: 0n,
    processMask: 0n,
    processShift: 0n,
    sequenceMask: 0xFFFFn,
  },
  custom: {
    id: 'custom',
    label: 'Custom Epoch',
    epochMs: 0n,
    shift: 22n,
    workerMask: 0x3E0000n,
    workerShift: 17n,
    processMask: 0x1F000n,
    processShift: 12n,
    sequenceMask: 0xFFFn,
  }
};

export interface SnowflakeDecodeResult {
  isValid: boolean;
  rawId: string;
  platform: SnowflakePlatform;
  epochMs: number;
  timestampDeltaMs: number;
  timestampMs: number;
  timestampSeconds: number;
  isoFormatted: string;
  utcFormatted: string;
  localFormatted: string;
  relativeFormatted: string;
  workerId: number;
  processId: number;
  sequence: number;
  binaryString: string;
  binary64?: string;
  error?: string;
}

export function decodeSnowflakeId(
  snowflakeInput: string | number | bigint,
  platform: SnowflakePlatform = 'discord',
  customEpochMs?: number | bigint
): SnowflakeDecodeResult {
  const rawId = String(snowflakeInput).trim();
  if (!rawId) {
    return {
      isValid: false,
      rawId: '',
      platform,
      epochMs: 0,
      timestampDeltaMs: 0,
      timestampMs: 0,
      timestampSeconds: 0,
      isoFormatted: '',
      utcFormatted: '',
      localFormatted: '',
      relativeFormatted: '',
      workerId: 0,
      processId: 0,
      sequence: 0,
      binaryString: '',
      binary64: '',
      error: 'Empty input',
    };
  }

  if (!/^\d+$/.test(rawId)) {
    return {
      isValid: false,
      rawId,
      platform,
      epochMs: 0,
      timestampDeltaMs: 0,
      timestampMs: 0,
      timestampSeconds: 0,
      isoFormatted: '',
      utcFormatted: '',
      localFormatted: '',
      relativeFormatted: '',
      workerId: 0,
      processId: 0,
      sequence: 0,
      binaryString: '',
      binary64: '',
      error: 'Invalid numeric timestamp',
    };
  }

  try {
    const idBigInt = BigInt(rawId);
    if (idBigInt < 0n) {
      return {
        isValid: false,
        rawId,
        platform,
        epochMs: 0,
        timestampDeltaMs: 0,
        timestampMs: 0,
        timestampSeconds: 0,
        isoFormatted: '',
        utcFormatted: '',
        localFormatted: '',
        relativeFormatted: '',
        workerId: 0,
        processId: 0,
        sequence: 0,
        binaryString: '',
        binary64: '',
        error: 'Negative ID',
      };
    }

    const cfg = SNOWFLAKE_PLATFORMS[platform] || SNOWFLAKE_PLATFORMS.discord;
    const epochBigInt = customEpochMs !== undefined ? BigInt(customEpochMs) : cfg.epochMs;
    const deltaBigInt = idBigInt >> cfg.shift;
    const totalMsBigInt = deltaBigInt + epochBigInt;
    const timestampMs = Number(totalMsBigInt);
    const timestampSeconds = Math.floor(timestampMs / 1000);

    const date = new Date(timestampMs);
    if (isNaN(date.getTime())) {
      return {
        isValid: false,
        rawId,
        platform,
        epochMs: Number(epochBigInt),
        timestampDeltaMs: Number(deltaBigInt),
        timestampMs: 0,
        timestampSeconds: 0,
        isoFormatted: '',
        utcFormatted: '',
        localFormatted: '',
        relativeFormatted: '',
        workerId: 0,
        processId: 0,
        sequence: 0,
        binaryString: '',
        error: 'Calculated timestamp out of valid date range',
      };
    }

    const workerId = cfg.workerMask && cfg.workerShift !== undefined
      ? Number((idBigInt & cfg.workerMask) >> cfg.workerShift)
      : 0;

    const processId = cfg.processMask && cfg.processShift !== undefined
      ? Number((idBigInt & cfg.processMask) >> cfg.processShift)
      : 0;

    const sequence = cfg.sequenceMask !== undefined
      ? Number(idBigInt & cfg.sequenceMask)
      : 0;

    const localFormatter = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'long',
    });

    const utcFormatter = new Intl.DateTimeFormat('en-US', {
      dateStyle: 'full',
      timeStyle: 'long',
      timeZone: 'UTC',
    });

    return {
      isValid: true,
      rawId,
      platform,
      epochMs: Number(epochBigInt),
      timestampDeltaMs: Number(deltaBigInt),
      timestampMs,
      timestampSeconds,
      isoFormatted: date.toISOString(),
      utcFormatted: utcFormatter.format(date),
      localFormatted: localFormatter.format(date),
      relativeFormatted: formatRelativeTime(date),
      workerId,
      processId,
      sequence,
      binaryString: idBigInt.toString(2).padStart(64, '0'),
      binary64: idBigInt.toString(2).padStart(64, '0'),
    };
  } catch (err: any) {
    return {
      isValid: false,
      rawId,
      platform,
      epochMs: 0,
      timestampDeltaMs: 0,
      timestampMs: 0,
      timestampSeconds: 0,
      isoFormatted: '',
      utcFormatted: '',
      localFormatted: '',
      relativeFormatted: '',
      workerId: 0,
      processId: 0,
      sequence: 0,
      binaryString: '',
      error: err.message || 'Error decoding snowflake',
    };
  }
}

// ─── Batch CSV & Multi-Line Converter Engine ─────────────────────────────────

export interface BatchRowResult {
  input: string;
  isValid: boolean;
  detectedUnit: 'seconds' | 'milliseconds';
  timestampSeconds: number;
  timestampMs: number;
  isoUtc: string;
  localTime: string;
  relative: string;
  error?: string;
}

export interface BatchTimestampResult {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rows: BatchRowResult[];
}

export function convertBatchTimestamps(rawText: string, unit: TimestampUnit = 'auto'): BatchTimestampResult {
  if (!rawText || !rawText.trim()) {
    return { totalRows: 0, validRows: 0, invalidRows: 0, rows: [] };
  }

  const lines = rawText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const rows: BatchRowResult[] = [];
  let validRows = 0;
  let invalidRows = 0;

  for (const line of lines) {
    const cleanToken = line.includes(',') ? line.split(',')[0].trim().replace(/^["']|["']$/g, '') : line.replace(/^["']|["']$/g, '');
    
    if (/^-?\d+$/.test(cleanToken)) {
      const conv = convertEpochToDate(cleanToken, unit);
      if (conv.isValid) {
        validRows++;
        rows.push({
          input: line,
          isValid: true,
          detectedUnit: conv.detectedUnit,
          timestampSeconds: conv.timestampSeconds,
          timestampMs: conv.timestampMs,
          isoUtc: conv.isoFormatted,
          localTime: conv.localFormatted,
          relative: conv.relativeFormatted,
        });
      } else {
        invalidRows++;
        rows.push({
          input: line,
          isValid: false,
          detectedUnit: 'seconds',
          timestampSeconds: 0,
          timestampMs: 0,
          isoUtc: '',
          localTime: '',
          relative: '',
          error: conv.error || 'Invalid timestamp',
        });
      }
    } else {
      const dateConv = convertDateToEpoch(cleanToken, 'utc');
      if (dateConv.isValid) {
        validRows++;
        const dateObj = new Date(dateConv.timestampMs);
        rows.push({
          input: line,
          isValid: true,
          detectedUnit: 'milliseconds',
          timestampSeconds: dateConv.timestampSeconds,
          timestampMs: dateConv.timestampMs,
          isoUtc: dateConv.isoFormatted,
          localTime: dateConv.localFormatted,
          relative: formatRelativeTime(dateObj),
        });
      } else {
        invalidRows++;
        rows.push({
          input: line,
          isValid: false,
          detectedUnit: 'seconds',
          timestampSeconds: 0,
          timestampMs: 0,
          isoUtc: '',
          localTime: '',
          relative: '',
          error: 'Invalid numeric timestamp',
        });
      }
    }
  }

  return {
    totalRows: rows.length,
    validRows,
    invalidRows,
    rows,
  };
}

export function generateBatchCsv(rows: BatchRowResult[]): string {
  const headers = ['Input', 'Detected Unit', 'Epoch Seconds', 'Epoch Milliseconds', 'UTC (ISO 8601)', 'Local Time', 'Relative Time'];
  const csvLines = [headers.join(',')];

  for (const r of rows) {
    if (r.isValid) {
      csvLines.push([
        `"${r.input.replace(/"/g, '""')}"`,
        r.detectedUnit,
        r.timestampSeconds,
        r.timestampMs,
        `"${r.isoUtc}"`,
        `"${r.localTime.replace(/"/g, '""')}"`,
        `"${r.relative.replace(/"/g, '""')}"`
      ].join(','));
    } else {
      csvLines.push([
        `"${r.input.replace(/"/g, '""')}"`,
        'invalid',
        '',
        '',
        `"ERROR: ${r.error || 'Invalid'}"`,
        '',
        ''
      ].join(','));
    }
  }

  return csvLines.join('\n');
}

export type BatchTimestampRow = BatchRowResult;
