import { describeBackupError } from './backups.service';

describe('describeBackupError', () => {
  it('reports a missing binary clearly on ENOENT', () => {
    const err = Object.assign(new Error('spawn mysqldump ENOENT'), { code: 'ENOENT' });
    const msg = describeBackupError(err, 'mysqldump');
    expect(msg).toContain('mysqldump executable not found');
    expect(msg).toContain('mysqldump');
  });

  it('surfaces the real mysqldump stderr for a runtime failure', () => {
    const err = Object.assign(new Error('Command failed'), {
      code: 2,
      stderr: "mysqldump: Got error: 1045: Access denied for user 'root'@'x' (using password: YES)\n",
    });
    const msg = describeBackupError(err, 'mysqldump');
    expect(msg).toBe("mysqldump: Got error: 1045: Access denied for user 'root'@'x' (using password: YES)");
  });

  it('accepts stderr delivered as a Buffer', () => {
    const err = Object.assign(new Error('Command failed'), {
      stderr: Buffer.from('mysqldump: unknown variable foo\n'),
    });
    expect(describeBackupError(err, 'mysqldump')).toBe('mysqldump: unknown variable foo');
  });

  it('falls back to the error message when there is no stderr', () => {
    expect(describeBackupError(new Error('boom'), 'mysqldump')).toBe('boom');
  });

  it('never throws on a nullish error', () => {
    expect(describeBackupError(undefined, 'mysqldump')).toBe('Unknown error while running mysqldump');
  });
});
