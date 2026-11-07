import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveClientIp } from '../src/management/csrf.js';

describe('resolveClientIp trust-proxy behavior', () => {
  it('ignores forwarded headers when trustProxy is false', () => {
    const ip = resolveClientIp({
      headers: { 'x-forwarded-for': '1.2.3.4', 'x-real-ip': '9.9.9.9' },
      socket: { remoteAddress: '10.0.0.1' },
    }, { trustProxy: false });
    assert.equal(ip, '10.0.0.1');
  });

  it('prefers X-Real-IP from the immediate proxy', () => {
    const ip = resolveClientIp({
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8', 'x-real-ip': '9.9.9.9' },
      socket: { remoteAddress: '10.0.0.1' },
    }, { trustProxy: true });
    assert.equal(ip, '9.9.9.9');
  });

  it('uses right-most X-Forwarded-For hop when Real-IP absent', () => {
    const ip = resolveClientIp({
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
      socket: { remoteAddress: '10.0.0.1' },
    }, { trustProxy: true });
    assert.equal(ip, '5.6.7.8');
  });
});
