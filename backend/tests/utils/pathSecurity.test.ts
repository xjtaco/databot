import { describe, it, expect, vi } from 'vitest';
import {
  containsForbiddenPattern,
  isPathWithinWorkFolder,
  validateFilePath,
} from '../../src/utils/pathSecurity';

// Mock the config module
vi.mock('../../src/base/config', () => ({
  config: {
    work_folder: '/app/databot/workfolder',
  },
}));

describe('pathSecurity', () => {
  describe('containsForbiddenPattern()', () => {
    describe('should return true for forbidden patterns', () => {
      it('should detect path traversal with ".."', () => {
        expect(containsForbiddenPattern('/app/databot/../etc/passwd')).toBe(true);
        expect(containsForbiddenPattern('/../root')).toBe(true);
        expect(containsForbiddenPattern('/some/path/..hidden')).toBe(true);
      });

      it('should detect /etc/ pattern', () => {
        expect(containsForbiddenPattern('/etc/passwd')).toBe(true);
        expect(containsForbiddenPattern('/etc/shadow')).toBe(true);
        expect(containsForbiddenPattern('/app/etc/config')).toBe(true);
      });

      it('should detect /sys/ pattern', () => {
        expect(containsForbiddenPattern('/sys/kernel')).toBe(true);
        expect(containsForbiddenPattern('/app/sys/class')).toBe(true);
      });

      it('should detect /proc/ pattern', () => {
        expect(containsForbiddenPattern('/proc/1/cmdline')).toBe(true);
        expect(containsForbiddenPattern('/app/proc/self')).toBe(true);
      });

      it('should detect /dev/ pattern', () => {
        expect(containsForbiddenPattern('/dev/null')).toBe(true);
        expect(containsForbiddenPattern('/dev/sda')).toBe(true);
        expect(containsForbiddenPattern('/app/dev/random')).toBe(true);
      });

      it('should detect /boot/ pattern', () => {
        expect(containsForbiddenPattern('/boot/grub')).toBe(true);
        expect(containsForbiddenPattern('/app/boot/kernel')).toBe(true);
      });
    });

    describe('should return false for safe patterns', () => {
      it('should allow normal paths', () => {
        expect(containsForbiddenPattern('/app/databot/workfolder/file.txt')).toBe(false);
        expect(containsForbiddenPattern('/home/user/documents/report.md')).toBe(false);
      });

      it('should allow paths with similar-looking but safe patterns', () => {
        // "etcetera" contains "etc" but not "/etc/"
        expect(containsForbiddenPattern('/app/etcetera/file.txt')).toBe(false);
        // "system" contains "sys" but not "/sys/"
        expect(containsForbiddenPattern('/app/system/config')).toBe(false);
        // "development" contains "dev" but not "/dev/"
        expect(containsForbiddenPattern('/app/development/file.txt')).toBe(false);
        // "process" contains "proc" but not "/proc/"
        expect(containsForbiddenPattern('/app/process/data')).toBe(false);
        // "bootstrap" contains "boot" but not "/boot/"
        expect(containsForbiddenPattern('/app/bootstrap/index.js')).toBe(false);
      });

      it('should allow single dots in filenames', () => {
        expect(containsForbiddenPattern('/app/databot/.gitignore')).toBe(false);
        expect(containsForbiddenPattern('/app/databot/file.txt')).toBe(false);
        expect(containsForbiddenPattern('/app/databot/archive.tar.gz')).toBe(false);
      });
    });
  });

  describe('isPathWithinWorkFolder()', () => {
    const workFolder = '/app/databot/workfolder';

    describe('should return true for paths within work folder', () => {
      it('should accept exact work folder path', () => {
        expect(isPathWithinWorkFolder('/app/databot/workfolder', workFolder)).toBe(true);
      });

      it('should accept files directly in work folder', () => {
        expect(isPathWithinWorkFolder('/app/databot/workfolder/file.txt', workFolder)).toBe(true);
      });

      it('should accept nested directories within work folder', () => {
        expect(isPathWithinWorkFolder('/app/databot/workfolder/subdir/file.txt', workFolder)).toBe(
          true
        );
        expect(isPathWithinWorkFolder('/app/databot/workfolder/a/b/c/d/file.txt', workFolder)).toBe(
          true
        );
      });

      it('should accept hidden files and directories', () => {
        expect(isPathWithinWorkFolder('/app/databot/workfolder/.hidden', workFolder)).toBe(true);
        expect(isPathWithinWorkFolder('/app/databot/workfolder/.hidden/file.txt', workFolder)).toBe(
          true
        );
      });
    });

    describe('should return false for paths outside work folder', () => {
      it('should reject parent directories', () => {
        expect(isPathWithinWorkFolder('/app/databot', workFolder)).toBe(false);
        expect(isPathWithinWorkFolder('/app', workFolder)).toBe(false);
        expect(isPathWithinWorkFolder('/', workFolder)).toBe(false);
      });

      it('should reject sibling directories', () => {
        expect(isPathWithinWorkFolder('/app/databot/other', workFolder)).toBe(false);
        expect(isPathWithinWorkFolder('/app/databot/logs', workFolder)).toBe(false);
      });

      it('should reject paths with prefix attack (workfolder-malicious)', () => {
        expect(
          isPathWithinWorkFolder('/app/databot/workfolder-malicious/file.txt', workFolder)
        ).toBe(false);
        expect(isPathWithinWorkFolder('/app/databot/workfolderX/file.txt', workFolder)).toBe(false);
      });

      it('should reject completely unrelated paths', () => {
        expect(isPathWithinWorkFolder('/home/user/file.txt', workFolder)).toBe(false);
        expect(isPathWithinWorkFolder('/tmp/file.txt', workFolder)).toBe(false);
        expect(isPathWithinWorkFolder('/var/log/syslog', workFolder)).toBe(false);
      });
    });

    describe('should handle path normalization', () => {
      it('should normalize double slashes', () => {
        expect(isPathWithinWorkFolder('/app/databot/workfolder//file.txt', workFolder)).toBe(true);
      });

      it('should normalize trailing slashes', () => {
        expect(isPathWithinWorkFolder('/app/databot/workfolder/', workFolder)).toBe(true);
      });

      it('should normalize current directory references', () => {
        expect(isPathWithinWorkFolder('/app/databot/workfolder/./file.txt', workFolder)).toBe(true);
      });
    });
  });

  describe('validateFilePath()', () => {
    describe('should validate absolute path requirement', () => {
      it('should reject relative paths', () => {
        const result = validateFilePath('relative/path/file.txt');
        expect(result.valid).toBe(false);
        expect(result.error).toBe('file_path must be an absolute path starting with "/"');
      });

      it('should reject paths without leading slash', () => {
        const result = validateFilePath('file.txt');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('absolute path');
      });

      it('should accept absolute paths', () => {
        const result = validateFilePath('/app/databot/workfolder/file.txt');
        expect(result.valid).toBe(true);
      });
    });

    describe('should detect forbidden patterns', () => {
      it('should reject path traversal attempts', () => {
        const result = validateFilePath('/app/databot/workfolder/../../../etc/passwd');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('forbidden pattern');
      });

      it('should reject /etc/ paths', () => {
        const result = validateFilePath('/etc/passwd');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('forbidden pattern');
      });

      it('should reject /proc/ paths', () => {
        const result = validateFilePath('/proc/self/environ');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('forbidden pattern');
      });

      it('should reject /sys/ paths', () => {
        const result = validateFilePath('/sys/kernel/config');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('forbidden pattern');
      });

      it('should reject /dev/ paths', () => {
        const result = validateFilePath('/dev/null');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('forbidden pattern');
      });

      it('should reject /boot/ paths', () => {
        const result = validateFilePath('/boot/grub/grub.cfg');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('forbidden pattern');
      });
    });

    describe('should validate work folder boundary', () => {
      it('should reject paths outside work folder', () => {
        const result = validateFilePath('/home/user/file.txt');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('within the work folder');
      });

      it('should reject parent directory paths', () => {
        const result = validateFilePath('/app/databot/file.txt');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('within the work folder');
      });

      it('should accept paths within work folder', () => {
        const result = validateFilePath('/app/databot/workfolder/file.txt');
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should accept the work folder itself', () => {
        const result = validateFilePath('/app/databot/workfolder');
        expect(result.valid).toBe(true);
      });

      it('should accept nested paths within work folder', () => {
        const result = validateFilePath('/app/databot/workfolder/a/b/c/file.txt');
        expect(result.valid).toBe(true);
      });

      it('should reject prefix attack paths', () => {
        const result = validateFilePath('/app/databot/workfolder-malicious/file.txt');
        expect(result.valid).toBe(false);
        expect(result.error).toContain('within the work folder');
      });
    });

    describe('should return normalized path', () => {
      it('should normalize double slashes', () => {
        const result = validateFilePath('/app/databot/workfolder//subdir//file.txt');
        expect(result.valid).toBe(true);
        expect(result.normalizedPath).toBe('/app/databot/workfolder/subdir/file.txt');
      });

      it('should normalize current directory references', () => {
        const result = validateFilePath('/app/databot/workfolder/./file.txt');
        expect(result.valid).toBe(true);
        expect(result.normalizedPath).toBe('/app/databot/workfolder/file.txt');
      });

      it('should normalize trailing slashes', () => {
        const result = validateFilePath('/app/databot/workfolder/subdir/');
        expect(result.valid).toBe(true);
        expect(result.normalizedPath).toBe('/app/databot/workfolder/subdir');
      });
    });

    describe('should accept custom work folder', () => {
      it('should validate against custom work folder', () => {
        const customWorkFolder = '/custom/work';
        const result = validateFilePath('/custom/work/file.txt', customWorkFolder);
        expect(result.valid).toBe(true);
      });

      it('should reject paths outside custom work folder', () => {
        const customWorkFolder = '/custom/work';
        const result = validateFilePath('/app/databot/workfolder/file.txt', customWorkFolder);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('/custom/work');
      });
    });

    describe('edge cases', () => {
      it('should handle paths with special characters', () => {
        const result = validateFilePath('/app/databot/workfolder/file with spaces.txt');
        expect(result.valid).toBe(true);
      });

      it('should handle paths with unicode characters', () => {
        const result = validateFilePath('/app/databot/workfolder/文件.txt');
        expect(result.valid).toBe(true);
      });

      it('should handle hidden files', () => {
        const result = validateFilePath('/app/databot/workfolder/.hidden');
        expect(result.valid).toBe(true);
      });

      it('should handle deeply nested paths', () => {
        const result = validateFilePath('/app/databot/workfolder/a/b/c/d/e/f/g/h/i/j/file.txt');
        expect(result.valid).toBe(true);
      });
    });
  });
});
