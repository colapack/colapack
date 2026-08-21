// import fs from 'node:fs';
import path from 'node:path';
import read from '../util/read.js';
import print from '../util/print.js';
import merge from '../util/merge.js';

let defaultConfig,
    packageConfig,
    qpurtConfig;

export default function build(apiConfig=undefined) {
    defaultConfig = {
        entry: 'src',
        output: 'dist',
        ignore: ['src/tests']
    }

    try { packageConfig = read('package.json').qpurtConfig?.build } 
    catch { packageConfig = undefined }

    try { qpurtConfig = read('qpurt.json').build } 
    catch { qpurtConfig = undefined }

    let mergedConfigs = merge(
        {},
        ...[defaultConfig, packageConfig, qpurtConfig, apiConfig].filter(x => x != null)
    );

    print.cyan(mergedConfigs, 'mergedConfigs');
    // print.magenta(validConfigs[0], 'validConfigs');

    // For now, we'll continue to use the invalid configs
    // until we write a validator.
    return 0;
}