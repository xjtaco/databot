import { describe, expect, it } from 'vitest';
import zhCN from '@/locales/zh-CN';
import enUS from '@/locales/en-US';

describe('chat guidance locale copy', () => {
  it('guides Chinese users toward both data analysis and system operations', () => {
    expect(zhCN.chat.inputPlaceholder).toContain('上传文件');
    expect(zhCN.chat.inputPlaceholder).toContain('创建工作流');
    expect(zhCN.chat.emptyState.description).toContain('数据分析');
    expect(zhCN.chat.emptyState.description).toContain('报告');
    expect(zhCN.chat.emptyState.description).toContain('数据源');
    expect(zhCN.chat.emptyState.description).toContain('工作流');
    expect(zhCN.chat.emptyState.description).toContain('定时任务');
  });

  it('guides English users toward both data analysis and system operations', () => {
    expect(enUS.chat.inputPlaceholder).toContain('upload files');
    expect(enUS.chat.inputPlaceholder).toContain('create workflows');
    expect(enUS.chat.emptyState.description).toContain('data analysis');
    expect(enUS.chat.emptyState.description).toContain('reports');
    expect(enUS.chat.emptyState.description).toContain('data sources');
    expect(enUS.chat.emptyState.description).toContain('workflows');
    expect(enUS.chat.emptyState.description).toContain('schedules');
  });
});
