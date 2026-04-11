import { describe, it, expect } from 'vitest';
import { inferColumnType } from '../../../src/table/typeInference';
import { FieldDataTypeValues } from '../../../src/table/table.types';

describe('typeInference', () => {
  describe('inferColumnType', () => {
    it('should infer string type for text values', () => {
      const values = ['hello', 'world', 'test', 'data', 'example'];
      expect(inferColumnType(values)).toBe(FieldDataTypeValues.STRING);
    });

    it('should infer number type for numeric values', () => {
      const values = ['1', '2', '3.14', '100', '-50', '0.5'];
      expect(inferColumnType(values)).toBe(FieldDataTypeValues.NUMBER);
    });

    it('should infer number type for values with commas', () => {
      const values = ['1,000', '2,500', '10,000', '100,000'];
      expect(inferColumnType(values)).toBe(FieldDataTypeValues.NUMBER);
    });

    it('should infer boolean type for true/false values', () => {
      const values = ['true', 'false', 'true', 'false', 'true'];
      expect(inferColumnType(values)).toBe(FieldDataTypeValues.BOOLEAN);
    });

    it('should infer boolean type for yes/no values', () => {
      const values = ['yes', 'no', 'YES', 'NO', 'Yes'];
      expect(inferColumnType(values)).toBe(FieldDataTypeValues.BOOLEAN);
    });

    it('should infer boolean type for 1/0 values', () => {
      const values = ['1', '0', '1', '0', '1', '0', '1', '0', '1', '0'];
      expect(inferColumnType(values)).toBe(FieldDataTypeValues.BOOLEAN);
    });

    it('should infer datetime type for ISO dates', () => {
      const values = ['2024-01-15', '2024-02-20', '2024-03-25', '2024-04-30', '2024-05-15'];
      expect(inferColumnType(values)).toBe(FieldDataTypeValues.DATETIME);
    });

    it('should infer datetime type for datetime with time', () => {
      const values = [
        '2024-01-15T10:30:00',
        '2024-02-20T14:45:00',
        '2024-03-25T09:15:00',
        '2024-04-30T16:00:00',
      ];
      expect(inferColumnType(values)).toBe(FieldDataTypeValues.DATETIME);
    });

    it('should infer datetime type for slash-formatted dates', () => {
      const values = ['2024/01/15', '2024/02/20', '2024/03/25', '2024/04/30'];
      expect(inferColumnType(values)).toBe(FieldDataTypeValues.DATETIME);
    });

    it('should default to string for empty values', () => {
      const values: string[] = [];
      expect(inferColumnType(values)).toBe(FieldDataTypeValues.STRING);
    });

    it('should default to string for all empty values', () => {
      const values = ['', '', '   ', ''];
      expect(inferColumnType(values)).toBe(FieldDataTypeValues.STRING);
    });

    it('should skip empty values in type inference', () => {
      const values = ['1', '2', '', '3', '4', '', '5'];
      expect(inferColumnType(values)).toBe(FieldDataTypeValues.NUMBER);
    });

    it('should default to string for mixed types below threshold', () => {
      const values = ['hello', '123', 'world', '456', 'test', '789', 'data', '100'];
      expect(inferColumnType(values)).toBe(FieldDataTypeValues.STRING);
    });

    it('should handle large sample sizes', () => {
      const values = Array(200).fill('100');
      expect(inferColumnType(values)).toBe(FieldDataTypeValues.NUMBER);
    });

    it('should only use first 100 values for sampling', () => {
      // First 80 are numbers, next 20 are numbers, then 100 strings
      const values = [
        ...Array(80).fill('100'),
        ...Array(20).fill('200'),
        ...Array(100).fill('not a number'),
      ];
      expect(inferColumnType(values)).toBe(FieldDataTypeValues.NUMBER);
    });
  });
});
