import path from 'node:path';
import fs from 'node:fs';
import print from './print.js'

export default function read(file) {
  let resolved = path.resolve(process.cwd(), file);

  if (!fs.existsSync(resolved)) return undefined;

  if (path.extname(resolved) === '.json') {
    try { return JSON.parse(fs.readFileSync(resolved), 'utf8') } 
    catch(err) { return print.red(err) }
  } else {
    try { return fs.readFileSync(resolved, 'utf8') } 
    catch(err) { return print.red(err) }
  }
}