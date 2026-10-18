import helmet from 'helmet';
import { config } from '../config';

/**
 * SEC-1: helmet + strict Content Security Policy
 * No unsafe-inline or unsafe-eval allowed.
 */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'none'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
  },
  hsts: config.NODE_ENV === 'production'
    ? { maxAge: 63072000, includeSubDomains: true, preload: true }
    : false,
  referrerPolicy: { policy: 'no-referrer' },
  xContentTypeOptions: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
});
