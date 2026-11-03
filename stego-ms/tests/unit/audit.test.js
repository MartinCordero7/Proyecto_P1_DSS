const { AuditLogger, ALLOWED_FIELDS } = require('../../src/utils/audit');

describe('AuditLogger', () => {
  let lines;
  let logger;

  beforeEach(() => {
    lines = [];
    logger = new AuditLogger((line) => lines.push(line));
  });

  const parse = (line) => JSON.parse(line.replace('[AUDIT] ', ''));

  it('writes one JSON line with timestamp, event and the allowed fields', () => {
    logger.log('analysis.completed', { user_id: 'u1', analysis_id: 'a1', status: 'sin_indicios' });

    expect(lines).toHaveLength(1);
    expect(lines[0].startsWith('[AUDIT] ')).toBe(true);
    expect(parse(lines[0])).toMatchObject({
      event: 'analysis.completed',
      user_id: 'u1',
      analysis_id: 'a1',
      status: 'sin_indicios'
    });
    expect(new Date(parse(lines[0]).ts).toString()).not.toBe('Invalid Date');
  });

  it('drops anything that is not on the allow-list (JWTs, headers, passwords, file contents)', () => {
    logger.log('http.request', {
      user_id: 'u1',
      token: 'eyJhbGciOiJSUzI1NiJ9.payload.signature',
      authorization: 'Bearer eyJhbGci',
      password: 'secret',
      body: Buffer.from('image bytes'),
      headers: { cookie: 'x' }
    });

    const entry = parse(lines[0]);
    expect(Object.keys(entry).sort()).toEqual(['event', 'ts', 'user_id']);
    expect(lines[0]).not.toMatch(/eyJ|secret|Bearer|cookie/);
  });

  it('only ever writes fields from ALLOWED_FIELDS', () => {
    const everything = Object.fromEntries(ALLOWED_FIELDS.map((key) => [key, 'x']));
    logger.log('test', { ...everything, extra: 'y' });

    expect(Object.keys(parse(lines[0])).filter((k) => !['ts', 'event'].includes(k)).sort()).toEqual(
      [...ALLOWED_FIELDS].sort()
    );
  });

  it('truncates very long strings', () => {
    logger.log('http.request', { path: '/' + 'a'.repeat(5000) });

    expect(parse(lines[0]).path.length).toBe(200);
  });

  it('neutralizes log-injection attempts (newlines stay inside the JSON string)', () => {
    logger.log('http.request', { path: '/x\n[AUDIT] {"event":"forged"}' });

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('\n');
  });

  it('skips null and undefined values', () => {
    logger.log('test', { user_id: null, analysis_id: undefined });

    expect(Object.keys(parse(lines[0])).sort()).toEqual(['event', 'ts']);
  });

  it('never throws if the sink fails', () => {
    const broken = new AuditLogger(() => {
      throw new Error('disk full');
    });

    expect(() => broken.log('test', {})).not.toThrow();
  });
});
