import path from 'node:path';

export default function build() {
    console.log(path.resolve(process.cwd()))

    return 0;
}