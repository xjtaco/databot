// backend/tests/copilotErrors.test.ts
import { describe, it, expect } from 'vitest';
import { CopilotSessionError, CopilotToolError, CopilotAgentLoopError } from '../src/errors/types';
import { ErrorCode } from '../src/errors/errorCode';

describe('Copilot error types', () => {
  it('CopilotSessionError has correct code and status', () => {
    const err = new CopilotSessionError('session lost');
    expect(err.code).toBe('E00032');
    expect(err.statusCode).toBe(400);
    expect(err.message).toBe('session lost');
    expect(err).toBeInstanceOf(CopilotSessionError);
  });

  it('CopilotToolError has correct code and status', () => {
    const err = new CopilotToolError('tool failed');
    expect(err.code).toBe('E00033');
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe('tool failed');
    expect(err).toBeInstanceOf(CopilotToolError);
  });

  it('CopilotAgentLoopError has correct code and status', () => {
    const err = new CopilotAgentLoopError('loop exceeded');
    expect(err.code).toBe('E00034');
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe('loop exceeded');
    expect(err).toBeInstanceOf(CopilotAgentLoopError);
  });

  it('ErrorCode constants exist', () => {
    expect(ErrorCode.COPILOT_SESSION_ERROR).toBe('E00032');
    expect(ErrorCode.COPILOT_TOOL_ERROR).toBe('E00033');
    expect(ErrorCode.COPILOT_AGENT_LOOP_ERROR).toBe('E00034');
  });
});
