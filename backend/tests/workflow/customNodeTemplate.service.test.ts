import { describe, it, expect } from 'vitest';
import * as service from '../../src/workflow/customNodeTemplate.service';

describe('customNodeTemplate.service', () => {
  it('should reject branch type when creating template', async () => {
    await expect(
      service.createTemplate({
        name: 'Test Branch',
        type: 'branch',
        config: { nodeType: 'branch', field: '', outputVariable: 'br' },
      })
    ).rejects.toThrow('Branch nodes cannot be saved as custom templates');
  });
});
