export default function colax(prefix) {
  if (!prefix) return /\{\{\s*([\w.]+)\s*\}\}/g;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\{\\{\\s*${escaped}(\\w+)\\s*\\}\\}`, 'g');
}