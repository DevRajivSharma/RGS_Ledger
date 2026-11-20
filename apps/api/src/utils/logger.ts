type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEYS = [
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'jwt',
  'secret',
  'encryption_key',
  'body',
  'cookie',
  'pairingcode'
];

function redactSensitiveData(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveData);
  }

  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some(k => lowerKey.includes(k))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      sanitized[key] = redactSensitiveData(val);
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>) {
    this.log('debug', message, context);
  },
  info(message: string, context?: Record<string, unknown>) {
    this.log('info', message, context);
  },
  warn(message: string, context?: Record<string, unknown>) {
    this.log('warn', message, context);
  },
  error(message: string, context?: Record<string, unknown>) {
    this.log('error', message, context);
  },
  log(level: LogLevel, message: string, context?: Record<string, unknown>) {
    const timestamp = new Date().toISOString();
    const sanitizedContext = context ? redactSensitiveData(context) : undefined;
    const logPayload = {
      timestamp,
      level,
      message,
      ...(sanitizedContext ? { context: sanitizedContext } : {})
    };

    const serialized = JSON.stringify(logPayload);
    if (level === 'error') {
      // eslint-disable-next-line no-console
      console.error(serialized);
    } else if (level === 'warn') {
      // eslint-disable-next-line no-console
      console.warn(serialized);
    } else {
      // eslint-disable-next-line no-console
      console.log(serialized);
    }
  }
};
