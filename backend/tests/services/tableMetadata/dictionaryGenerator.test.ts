import { describe, it, expect } from 'vitest';
import {
  generateDictionaryContent,
  generateDictionaryFilename,
} from '../../../src/table/dictionaryGenerator';
import {
  TableWithColumns,
  FieldDataTypeValues,
  TableSourceTypeValues,
} from '../../../src/table/table.types';

describe('dictionaryGenerator', () => {
  const mockTable: TableWithColumns = {
    id: '550e8400-e29b-41d4-a716-446655440001',
    displayName: '销售数据',
    physicalName: 'sales_data',
    description: '2024年销售记录',
    type: TableSourceTypeValues.CSV,
    dictionaryPath: 'files/sales_data_销售数据.md',
    dataFilePath: '2024-01-15/sales.csv',
    createdAt: new Date('2024-01-15'),
    updatedAt: new Date('2024-01-15'),
    columns: [
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        tableId: '550e8400-e29b-41d4-a716-446655440001',
        displayName: '订单号',
        physicalName: 'order_id',
        description: '唯一订单标识',
        dataType: FieldDataTypeValues.STRING,
        columnOrder: 0,
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-15'),
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440003',
        tableId: '550e8400-e29b-41d4-a716-446655440001',
        displayName: '金额',
        physicalName: 'amount',
        description: '订单金额',
        dataType: FieldDataTypeValues.NUMBER,
        columnOrder: 1,
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-15'),
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440004',
        tableId: '550e8400-e29b-41d4-a716-446655440001',
        displayName: '下单时间',
        physicalName: 'order_time',
        dataType: FieldDataTypeValues.DATETIME,
        columnOrder: 2,
        createdAt: new Date('2024-01-15'),
        updatedAt: new Date('2024-01-15'),
      },
    ],
  };

  describe('generateDictionaryContent', () => {
    it('should generate markdown with table name as title', () => {
      const content = generateDictionaryContent(mockTable);
      expect(content).toContain('# 销售数据');
    });

    it('should include physical name', () => {
      const content = generateDictionaryContent(mockTable);
      expect(content).toContain('**物理表名**: sales_data');
    });

    it('should include description', () => {
      const content = generateDictionaryContent(mockTable);
      expect(content).toContain('**描述**: 2024年销售记录');
    });

    it('should include column table header', () => {
      const content = generateDictionaryContent(mockTable);
      expect(content).toContain('| 字段名 | 物理名 | 类型 | 描述 |');
      expect(content).toContain('|--------|--------|------|------|');
    });

    it('should include all columns', () => {
      const content = generateDictionaryContent(mockTable);
      expect(content).toContain('| 订单号 | order_id | string | 唯一订单标识 |');
      expect(content).toContain('| 金额 | amount | number | 订单金额 |');
      expect(content).toContain('| 下单时间 | order_time | datetime | - |');
    });

    it('should sort columns by columnOrder', () => {
      const unorderedTable: TableWithColumns = {
        ...mockTable,
        columns: [
          { ...mockTable.columns[2], columnOrder: 2 },
          { ...mockTable.columns[0], columnOrder: 0 },
          { ...mockTable.columns[1], columnOrder: 1 },
        ],
      };
      const content = generateDictionaryContent(unorderedTable);
      const lines = content.split('\n');
      const dataLines = lines.filter(
        (line) => line.startsWith('| ') && !line.startsWith('| 字段名') && !line.startsWith('|---')
      );
      expect(dataLines[0]).toContain('order_id');
      expect(dataLines[1]).toContain('amount');
      expect(dataLines[2]).toContain('order_time');
    });

    it('should handle table without description', () => {
      const tableWithoutDesc: TableWithColumns = {
        ...mockTable,
        description: undefined,
      };
      const content = generateDictionaryContent(tableWithoutDesc);
      expect(content).toContain('**描述**: (无)');
    });

    it('should include data source type for csv/excel files', () => {
      const content = generateDictionaryContent(mockTable);
      expect(content).toContain('**数据来源**: 文件');
    });

    it('should include data file path', () => {
      const content = generateDictionaryContent(mockTable);
      expect(content).toContain('**文件路径**: 2024-01-15/sales.csv');
    });
  });

  describe('generateDictionaryFilename', () => {
    it('should combine physical name and display name', () => {
      const filename = generateDictionaryFilename(mockTable);
      expect(filename).toBe('sales_data_销售数据');
    });

    it('should sanitize unsafe characters', () => {
      const tableWithUnsafeChars: TableWithColumns = {
        ...mockTable,
        physicalName: 'test/file:name',
        displayName: 'test*file?name',
      };
      const filename = generateDictionaryFilename(tableWithUnsafeChars);
      expect(filename).toBe('test_file_name_test_file_name');
    });
  });
});
