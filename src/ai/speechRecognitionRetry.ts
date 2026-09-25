export const APPLE_ERROR7_RETRY_DELAY_MS = 500;
export const APPLE_ERROR7_MAX_RETRIES = 1;

export function isAppleAssistantError7(
  deviceGroup: string,
  error: string,
  message: string,
): boolean {
  return deviceGroup === "ios/fallback" && error === "aborted" &&
    /kAFAssistantErrorDomain[\s\S]*(?:エラー|error)?\s*7\b/i.test(message);
}
