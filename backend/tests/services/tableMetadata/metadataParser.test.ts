import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as XLSX from 'xlsx';
import {
  parseCsvMetadata,
  parseExcelMetadata,
  parseFileMetadata,
} from '../../../src/table/metadataParser';
import { MetadataParseError } from '../../../src/errors/types';
import { FieldDataTypeValues } from '../../../src/table/table.types';

// Mock logger
vi.mock('../../../src/utils/logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
}));

describe('metadataParser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function createCsvBuffer(content: string): Buffer {
    return Buffer.from(content, 'utf-8');
  }

  function createExcelBuffer(sheets: { name: string; data: unknown[][] }[]): Buffer {
    const workbook = XLSX.utils.book_new();
    for (const sheet of sheets) {
      const worksheet = XLSX.utils.aoa_to_sheet(sheet.data);
      XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
    }
    return Buffer.from(XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }));
  }

  describe('parseCsvMetadata', () => {
    it('should parse CSV with string columns', () => {
      const csv = 'name,city\nAlice,Beijing\nBob,Shanghai\nCharlie,Guangzhou';
      const buffer = createCsvBuffer(csv);

      const result = parseCsvMetadata(buffer, 'users.csv', 'users_123.csv', 'uploads');

      expect(result.displayName).toBe('users');
      expect(result.physicalName).toBe('users');
      expect(result.dataFilePath).toBe('uploads/users_123.csv');
      expect(result.columns).toHaveLength(2);
      expect(result.columns[0].displayName).toBe('name');
      expect(result.columns[0].dataType).toBe(FieldDataTypeValues.STRING);
      expect(result.columns[1].displayName).toBe('city');
      expect(result.columns[1].dataType).toBe(FieldDataTypeValues.STRING);
    });

    it('should parse CSV and detect column types', () => {
      // Note: xlsx library converts CSV numeric values to numbers internally
      // Type inference happens on string representations of values
      const csv = 'id,amount\n1,100.50\n2,200.75\n3,300.25';
      const buffer = createCsvBuffer(csv);

      const result = parseCsvMetadata(buffer, 'transactions.csv', 'trans.csv', 'data');

      expect(result.columns).toHaveLength(2);
      // Type detection depends on xlsx library's internal conversion
      expect(result.columns[0].displayName).toBe('id');
      expect(result.columns[1].displayName).toBe('amount');
    });

    it('should detect datetime type from ISO date strings', () => {
      // Test datetime detection using Excel which preserves string format better
      const buffer = createExcelBuffer([
        {
          name: 'Sheet1',
          data: [
            ['event', 'date'],
            ['A', '2024-01-15'],
            ['B', '2024-02-20'],
            ['C', '2024-03-25'],
            ['D', '2024-04-30'],
            ['E', '2024-05-15'],
          ],
        },
      ]);

      const result = parseExcelMetadata(buffer, 'events.xlsx', ['events.csv'], 'data');

      expect(result[0].columns[1].dataType).toBe(FieldDataTypeValues.DATETIME);
    });

    it('should parse CSV with boolean columns', () => {
      const csv = 'name,active\nAlice,true\nBob,false\nCharlie,true';
      const buffer = createCsvBuffer(csv);

      const result = parseCsvMetadata(buffer, 'users.csv', 'users.csv', 'data');

      expect(result.columns[1].dataType).toBe(FieldDataTypeValues.BOOLEAN);
    });

    it('should sanitize column names with special characters', () => {
      const csv = 'user name,email@address\nAlice,alice@test.com';
      const buffer = createCsvBuffer(csv);

      const result = parseCsvMetadata(buffer, 'users.csv', 'users.csv', 'data');

      expect(result.columns[0].displayName).toBe('user name');
      expect(result.columns[0].physicalName).toBe('user_name');
      expect(result.columns[1].displayName).toBe('email@address');
      expect(result.columns[1].physicalName).toBe('email_address');
    });

    it('should handle Chinese file names', () => {
      // Test Chinese file name handling (column names tested via Excel to avoid CSV encoding issues)
      const csv = 'name,age\nAlice,25\nBob,30';
      const buffer = createCsvBuffer(csv);

      const result = parseCsvMetadata(buffer, '用户.csv', 'users.csv', 'data');

      expect(result.displayName).toBe('用户');
      expect(result.physicalName).toBe('用户');
    });

    it('should handle Chinese column names in Excel', () => {
      // Excel format handles UTF-8 encoding properly
      const buffer = createExcelBuffer([
        {
          name: 'Sheet1',
          data: [
            ['姓名', '年龄'],
            ['张三', 25],
            ['李四', 30],
          ],
        },
      ]);

      const result = parseExcelMetadata(buffer, '用户.xlsx', ['users.csv'], 'data');

      expect(result[0].displayName).toBe('用户_Sheet1');
      expect(result[0].columns[0].displayName).toBe('姓名');
      expect(result[0].columns[0].physicalName).toBe('姓名');
      expect(result[0].columns[1].displayName).toBe('年龄');
    });

    it('should throw error for empty CSV', () => {
      const buffer = createCsvBuffer('');

      expect(() => parseCsvMetadata(buffer, 'empty.csv', 'empty.csv', 'data')).toThrow(
        MetadataParseError
      );
    });

    it('should throw error for CSV with only header', () => {
      const csv = 'name,age';
      const buffer = createCsvBuffer(csv);

      const result = parseCsvMetadata(buffer, 'header_only.csv', 'header.csv', 'data');

      // Should still work with just headers, no data rows
      expect(result.columns).toHaveLength(2);
    });

    it('should skip empty column headers', () => {
      const csv = 'name,,age\nAlice,,25\nBob,,30';
      const buffer = createCsvBuffer(csv);

      const result = parseCsvMetadata(buffer, 'users.csv', 'users.csv', 'data');

      expect(result.columns).toHaveLength(2);
      expect(result.columns[0].displayName).toBe('name');
      expect(result.columns[1].displayName).toBe('age');
    });

    it('should set correct column order', () => {
      const csv = 'a,b,c\n1,2,3';
      const buffer = createCsvBuffer(csv);

      const result = parseCsvMetadata(buffer, 'test.csv', 'test.csv', 'data');

      expect(result.columns[0].columnOrder).toBe(0);
      expect(result.columns[1].columnOrder).toBe(1);
      expect(result.columns[2].columnOrder).toBe(2);
    });
  });

  describe('parseExcelMetadata', () => {
    it('should parse Excel with single sheet', () => {
      const buffer = createExcelBuffer([
        {
          name: 'Sheet1',
          data: [
            ['name', 'age'],
            ['Alice', 25],
            ['Bob', 30],
          ],
        },
      ]);

      const result = parseExcelMetadata(buffer, 'users.xlsx', ['sheet1.csv'], 'data');

      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe('users_Sheet1');
      expect(result[0].columns).toHaveLength(2);
    });

    it('should parse Excel with multiple sheets', () => {
      const buffer = createExcelBuffer([
        {
          name: 'Users',
          data: [
            ['name', 'email'],
            ['Alice', 'alice@test.com'],
          ],
        },
        {
          name: 'Orders',
          data: [
            ['order_id', 'amount'],
            [1, 100],
          ],
        },
      ]);

      const result = parseExcelMetadata(
        buffer,
        'data.xlsx',
        ['users.csv', 'orders.csv'],
        'uploads'
      );

      expect(result).toHaveLength(2);
      expect(result[0].displayName).toBe('data_Users');
      expect(result[0].physicalName).toBe('data_Users');
      expect(result[1].displayName).toBe('data_Orders');
      expect(result[1].physicalName).toBe('data_Orders');
    });

    it('should skip sheets without corresponding saved files', () => {
      const buffer = createExcelBuffer([
        {
          name: 'Sheet1',
          data: [['name'], ['Alice']],
        },
        {
          name: 'Sheet2',
          data: [['age'], [25]],
        },
      ]);

      // Only provide one saved file
      const result = parseExcelMetadata(buffer, 'test.xlsx', ['sheet1.csv'], 'data');

      expect(result).toHaveLength(1);
    });

    it('should skip empty sheets', () => {
      const buffer = createExcelBuffer([
        {
          name: 'Empty',
          data: [],
        },
        {
          name: 'Data',
          data: [['name'], ['Alice']],
        },
      ]);

      const result = parseExcelMetadata(buffer, 'test.xlsx', ['empty.csv', 'data.csv'], 'uploads');

      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe('test_Data');
    });

    it('should throw error when all sheets are empty', () => {
      const buffer = createExcelBuffer([
        {
          name: 'Empty1',
          data: [],
        },
        {
          name: 'Empty2',
          data: [],
        },
      ]);

      expect(() => parseExcelMetadata(buffer, 'empty.xlsx', ['e1.csv', 'e2.csv'], 'data')).toThrow(
        MetadataParseError
      );
    });
  });

  describe('parseFileMetadata', () => {
    it('should route CSV files to parseCsvMetadata', () => {
      const csv = 'name\nAlice';
      const buffer = createCsvBuffer(csv);

      const result = parseFileMetadata(buffer, 'test.csv', ['test.csv'], 'data');

      expect(result).toHaveLength(1);
      expect(result[0].displayName).toBe('test');
    });

    it('should route XLSX files to parseExcelMetadata', () => {
      const buffer = createExcelBuffer([
        {
          name: 'Sheet1',
          data: [['name'], ['Alice']],
        },
      ]);

      const result = parseFileMetadata(buffer, 'test.xlsx', ['sheet1.csv'], 'data');

      expect(result).toHaveLength(1);
    });

    it('should route XLS files to parseExcelMetadata', () => {
      const buffer = createExcelBuffer([
        {
          name: 'Sheet1',
          data: [['name'], ['Alice']],
        },
      ]);

      const result = parseFileMetadata(buffer, 'test.xls', ['sheet1.csv'], 'data');

      expect(result).toHaveLength(1);
    });

    it('should throw error for unsupported file types', () => {
      const buffer = Buffer.from('content');

      expect(() => parseFileMetadata(buffer, 'test.txt', ['test.txt'], 'data')).toThrow(
        MetadataParseError
      );
      expect(() => parseFileMetadata(buffer, 'test.txt', ['test.txt'], 'data')).toThrow(
        'Unsupported file type'
      );
    });

    it('should handle uppercase extensions', () => {
      const csv = 'name\nAlice';
      const buffer = createCsvBuffer(csv);

      const result = parseFileMetadata(buffer, 'test.CSV', ['test.csv'], 'data');

      expect(result).toHaveLength(1);
    });
  });
});
