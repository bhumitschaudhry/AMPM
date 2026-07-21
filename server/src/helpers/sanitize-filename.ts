import path from "path";
import xss from "xss";

/**
 * Sanitize a filename to prevent path traversal and XSS attacks.
 * Removes dangerous characters and normalizes the filename.
 */
export function sanitizeFilename(filename: string): string {
  // Get just the basename, removing any path separators
  let sanitized = path.basename(filename);
  
  // Remove null bytes
  sanitized = sanitized.replace(/\0/g, "");
  
  // Apply XSS sanitization
  sanitized = xss(sanitized);
  
  // Remove any remaining dangerous characters
  sanitized = sanitized.replace(/[<>:"/\\|?*\x00-\x1f]/g, "");
  
  // Trim whitespace and dots from start/end
  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, "");
  
  // If filename is empty after sanitization, generate a default
  if (!sanitized) {
    sanitized = "unnamed";
  }
  
  return sanitized;
}
