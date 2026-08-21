import fs from 'node:fs';
import path from 'node:path';
import print from './print.js';

// Directory walker
export default function find(dir, ext, results = []) {
  let resolved = path.resolve(process.cwd(), dir);

  if (!fs.existsSync(resolved)) {
    // console.log(`Path does not exist: ${resolved}`);
    return results;
  }

  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  // print.cyan(entries)
  for (const entry of entries) {
    const fullPath = path.join(resolved, entry.name);
    // print.cyan(fullPath)

    if (entry.isDirectory()) {
      find(fullPath, ext, results); // recurse into subdirectory
    } else if (entry.isFile() && (ext === undefined || path.extname(entry.name) === ext)) {
      results.push(fullPath);
    }
  }

  return results;
}