const SECRET_PATTERNS = [
  { pattern: /(Bearer\s+)[A-Za-z0-9._~-]+/gi, replacement: "$1[REDACTED]" },
  {
    pattern: /((?:access[_-]?token|token)\s*[=:]\s*)[A-Za-z0-9._~-]+/gi,
    replacement: "$1[REDACTED]",
  },
  { pattern: /\b(?:EAA|AAQ)[A-Za-z0-9_-]{30,}\b/g, replacement: "[REDACTED]" },
  { pattern: /\b[A-Za-z0-9_-]{100,}\b/g, replacement: "[REDACTED]" },
];

export const redactSecretsFromText = (value) => {
  let output = String(value || "");
  for (const { pattern, replacement } of SECRET_PATTERNS) {
    output = output.replace(pattern, replacement);
  }
  return output;
};
