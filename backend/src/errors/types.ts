import { HttpStatusCode } from '../base/types';
import { ErrorCode } from './errorCode';

export class ApiError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly cause?: Error;

  constructor(
    message: string,
    code: string,
    status: number = 400,
    details?: unknown,
    cause?: Error
  ) {
    super(message);
    this.code = code;
    this.statusCode = status;
    this.details = details;
    this.cause = cause;
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ApiError.prototype);
  }
  toJSON() {
    return {
      code: this.code,
      statusCode: this.statusCode,
      message: this.message,
      details: this.details,
    };
  }
}

export class ValidationError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.VALIDATION_ERROR, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class DatasourceConnectionError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(
      message,
      ErrorCode.DATASOURCE_CONNECTION_ERROR,
      HttpStatusCode.BAD_REQUEST,
      details,
      cause
    );
    Object.setPrototypeOf(this, DatasourceConnectionError.prototype);
  }
}

export class DatasourceDuplicateError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.DATASOURCE_DUPLICATE, HttpStatusCode.CONFLICT, details, cause);
    Object.setPrototypeOf(this, DatasourceDuplicateError.prototype);
  }
}

export class DatasourceQueryError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.DATASOURCE_QUERY_ERROR, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, DatasourceQueryError.prototype);
  }
}

export class DatasourceSchemaError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.DATASOURCE_SCHEMA_ERROR, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, DatasourceSchemaError.prototype);
  }
}

export class SessionError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.SESSION_ERROR, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, SessionError.prototype);
  }
}

export class ToolExecutionError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.TOOL_EXECUTION_ERROR, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, ToolExecutionError.prototype);
  }
}

export class SandboxContainerError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(
      message,
      ErrorCode.SANDBOX_CONTAINER_ERROR,
      HttpStatusCode.SERVICE_UNAVAILABLE,
      details,
      cause
    );
    Object.setPrototypeOf(this, SandboxContainerError.prototype);
  }
}

export class FileUploadError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.FILE_UPLOAD_ERROR, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, FileUploadError.prototype);
  }
}

export class InvalidFileTypeError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.INVALID_FILE_TYPE, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, InvalidFileTypeError.prototype);
  }
}

export class MetadataParseError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.METADATA_PARSE_ERROR, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, MetadataParseError.prototype);
  }
}

export class MetadataNotFoundError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.METADATA_NOT_FOUND, HttpStatusCode.NOT_FOUND, details, cause);
    Object.setPrototypeOf(this, MetadataNotFoundError.prototype);
  }
}

export class DictionaryError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(
      message,
      ErrorCode.DICTIONARY_ERROR,
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      details,
      cause
    );
    Object.setPrototypeOf(this, DictionaryError.prototype);
  }
}

export class SqliteParseError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.SQLITE_PARSE_ERROR, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, SqliteParseError.prototype);
  }
}

export class KnowledgeNotFoundError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.KNOWLEDGE_NOT_FOUND, HttpStatusCode.NOT_FOUND, details, cause);
    Object.setPrototypeOf(this, KnowledgeNotFoundError.prototype);
  }
}

export class KnowledgeFileError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.KNOWLEDGE_FILE_ERROR, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, KnowledgeFileError.prototype);
  }
}

export class ConfigTestError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.CONFIG_TEST_ERROR, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, ConfigTestError.prototype);
  }
}

export class ChatSessionNotFoundError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.CHAT_SESSION_NOT_FOUND, HttpStatusCode.NOT_FOUND, details, cause);
    Object.setPrototypeOf(this, ChatSessionNotFoundError.prototype);
  }
}

export class WorkflowNotFoundError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.WORKFLOW_NOT_FOUND, HttpStatusCode.NOT_FOUND, details, cause);
    Object.setPrototypeOf(this, WorkflowNotFoundError.prototype);
  }
}

export class WorkflowNodeNotFoundError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.WORKFLOW_NODE_NOT_FOUND, HttpStatusCode.NOT_FOUND, details, cause);
    Object.setPrototypeOf(this, WorkflowNodeNotFoundError.prototype);
  }
}

export class WorkflowEdgeNotFoundError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.WORKFLOW_EDGE_NOT_FOUND, HttpStatusCode.NOT_FOUND, details, cause);
    Object.setPrototypeOf(this, WorkflowEdgeNotFoundError.prototype);
  }
}

export class WorkflowValidationError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.WORKFLOW_VALIDATION_ERROR, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, WorkflowValidationError.prototype);
  }
}

export class WorkflowExecutionError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(
      message,
      ErrorCode.WORKFLOW_EXECUTION_ERROR,
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      details,
      cause
    );
    Object.setPrototypeOf(this, WorkflowExecutionError.prototype);
  }
}

export class WorkflowCycleDetectedError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.WORKFLOW_CYCLE_DETECTED, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, WorkflowCycleDetectedError.prototype);
  }
}

export class CustomNodeTemplateNotFoundError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(
      message,
      ErrorCode.CUSTOM_NODE_TEMPLATE_NOT_FOUND,
      HttpStatusCode.NOT_FOUND,
      details,
      cause
    );
    Object.setPrototypeOf(this, CustomNodeTemplateNotFoundError.prototype);
  }
}

export class WorkflowCloneError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.WORKFLOW_CLONE_ERROR, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, WorkflowCloneError.prototype);
  }
}

export class CopilotSessionError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.COPILOT_SESSION_ERROR, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, CopilotSessionError.prototype);
  }
}

export class CopilotToolError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(
      message,
      ErrorCode.COPILOT_TOOL_ERROR,
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      details,
      cause
    );
    Object.setPrototypeOf(this, CopilotToolError.prototype);
  }
}

export class CopilotAgentLoopError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(
      message,
      ErrorCode.COPILOT_AGENT_LOOP_ERROR,
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      details,
      cause
    );
    Object.setPrototypeOf(this, CopilotAgentLoopError.prototype);
  }
}

export class ScheduleNotFoundError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.SCHEDULE_NOT_FOUND, HttpStatusCode.NOT_FOUND, details, cause);
    Object.setPrototypeOf(this, ScheduleNotFoundError.prototype);
  }
}

export class ScheduleValidationError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.SCHEDULE_VALIDATION_ERROR, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, ScheduleValidationError.prototype);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(
    message: string,
    code: string = ErrorCode.UNAUTHORIZED,
    details?: unknown,
    cause?: Error
  ) {
    super(message, code, HttpStatusCode.UNAUTHORIZED, details, cause);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class ForbiddenError extends ApiError {
  constructor(
    message: string,
    code: string = ErrorCode.FORBIDDEN,
    details?: unknown,
    cause?: Error
  ) {
    super(message, code, HttpStatusCode.FORBIDDEN, details, cause);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

// Uses 400 (not 409) per API spec — duplicate username/email treated as validation errors
export class ConflictError extends ApiError {
  constructor(message: string, code: string, details?: unknown, cause?: Error) {
    super(message, code, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class PasswordPolicyError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(message, ErrorCode.PASSWORD_POLICY_VIOLATION, HttpStatusCode.BAD_REQUEST, details, cause);
    Object.setPrototypeOf(this, PasswordPolicyError.prototype);
  }
}

export class AuditLogExportError extends ApiError {
  constructor(message: string, details?: unknown, cause?: Error) {
    super(
      message,
      ErrorCode.AUDIT_LOG_EXPORT_ERROR,
      HttpStatusCode.INTERNAL_SERVER_ERROR,
      details,
      cause
    );
    Object.setPrototypeOf(this, AuditLogExportError.prototype);
  }
}
