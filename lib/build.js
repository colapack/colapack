import path from 'node:path';
import print from '../util/print.js';

export default function build() {
    print(path.resolve(process.cwd()));

    return 0;
}