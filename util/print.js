import { format } from 'node:util';

const originalLog = console.log;

const codes = {
    red: '31',
    green: '32',
    yellow: '33',
    blue: '34',
    magenta: '35',
    cyan: '36',
    white: '37',
    gray: '90',
};

function colorize(code, args) {
    return `\x1b[${code}m${format(...args)}\x1b[0m`;
}

// print() itself is plain/colorless, color variants are attached as properties
const print = (...args) => {
    originalLog(...args);
};

for (const [name, code] of Object.entries(codes)) {
    print[name] = (...args) => {
        originalLog(colorize(code, args));
    };
}

export default print;