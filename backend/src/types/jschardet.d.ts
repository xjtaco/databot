declare module 'jschardet' {
  interface DetectionResult {
    encoding: string | null;
    confidence: number;
  }

  function detect(buffer: Buffer | string): DetectionResult;

  export { detect, DetectionResult };
}
