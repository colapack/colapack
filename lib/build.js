import util from '../util/__index.js';

let defaultConfig,
    packageConfig,
    qpurtConfig;

export default function build(apiConfig=undefined) {
    defaultConfig = {
        entry: 'src',
        output: 'dist',
        ignore: ['src/tests']
    }

    try { packageConfig = util.read('package.json').qpurtConfig?.build } 
    catch { packageConfig = undefined }

    try { qpurtConfig = util.read('qpurt.json').build } 
    catch { qpurtConfig = undefined }

    // Merge order
    let mergedConfigs = util.merge(
        {},
        ...[
            defaultConfig, 
            packageConfig, 
            qpurtConfig, 
            apiConfig
        ].filter(x => x != null)
    );

    // For now, we'll continue to use the invalid configs
    // until we write a validator to make sure we have proper 
    // error handling on user config errors.

    util.print.magenta(mergedConfigs);

    let test = util.find(mergedConfigs.entry);

    util.print(test);
    return 0;
}