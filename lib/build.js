import path from 'node:path';
import read from '../util/read.js';
import merge from '../util/merge.js';
import print from '../util/print.js';

let example_a = {
    x: 1
}
let example_b = {
    y: 2
}

export default function build() {
    let pkg = read('package.json');
    let merged = merge(example_a, example_b);

    console.log(pkg)
    console.log(merged)

    return 0;
}