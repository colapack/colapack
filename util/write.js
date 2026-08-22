import path from 'node:path';
import fs from 'node:fs';
import print from './print.js';

export default function write(outputPath, outputContent) {
    try {
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const existing = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : null;

        if (existing !== outputContent) {
            fs.writeFileSync(outputPath, outputContent);
        }
    } catch (err) {
        print.red(err);
    }
}