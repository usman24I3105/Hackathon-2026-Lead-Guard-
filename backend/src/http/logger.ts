import pino from 'pino';
import { redactPaths } from '../security/redact';
import { config } from '../config';

const logger = pino({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: { paths: redactPaths, censor: '[Redacted]' },
  ...(config.NODE_ENV !== 'production' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  }),
});

export default logger;
