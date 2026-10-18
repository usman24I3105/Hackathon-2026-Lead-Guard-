/**
 * SEC-4: Pino redaction paths — strips secrets from all log output.
 */
export const redactPaths = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  'res.headers.set-cookie',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.apiKey',
  '*.api_key',
  '*.cardNumber',
  '*.cvv',
];
