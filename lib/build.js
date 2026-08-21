import path from 'node:path';
import read from '../util/read.js';
import print from '../util/print.js';

export default function build() {
    let pkg = read('package.json');

    console.log(pkg)

    return 0;
}