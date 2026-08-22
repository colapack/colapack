import path from 'node:path';
import util from '../util/__index.js';

let defaultConfig,
    packageConfig,
    qpurtConfig,
    mergedConfigs,
    entryPath,
    isInEntry,
    ignorePaths,
    isIgnored,
    htmlFiles,
    jsonFiles,
    htmlPartials=[],
    htmlPages=[],
    jsonPages=[];

export default function build(apiConfig=undefined) {
    defaultConfig = {
        entry: 'src',
        output: 'dist',
        ignore: []
    }

    try { 
        packageConfig = 
            util.read('package.json').qpurtConfig?.build;
    } 
    catch { packageConfig = undefined }

    try { qpurtConfig = util.read('qpurt.json').build } 
    catch { qpurtConfig = undefined }

    // Merge order
    mergedConfigs = util.merge(
        {},
        ...[
            packageConfig, 
            qpurtConfig, 
            apiConfig
        ].filter(x => x != null)
    );

    // For now, we'll continue to use the invalid configs
    // until we write a validator to make sure we have proper 
    // error handling on user config errors.

    htmlFiles = util.find(process.cwd(), '.html');
    jsonFiles = util.find(process.cwd(), '.json');

    entryPath = 
        path.resolve(
            process.cwd(), 
            mergedConfigs.entry || defaultConfig.entry);

    isInEntry = (filePath) => filePath === 
        entryPath || filePath.startsWith(entryPath + path.sep);

    ignorePaths = 
        (mergedConfigs.ignore || defaultConfig.ignore || [])
            .map(p =>path.resolve(process.cwd(), p));

    isIgnored = (filePath) =>
        ignorePaths.some(ignored => filePath.startsWith(ignored));

    // Run through entry(all html) and ignore configured files
    htmlFiles.filter(f => isInEntry(f) && !isIgnored(f))
        .forEach(f => {
            const content = util.read(f);
            if (content == null || content.trim() === '') return;
            if (!content.startsWith('<!DOCTYPE')) htmlPartials.push(f);
            else htmlPages.push(f);
        }
    );

    // Run through entry(all json) and ignore configured files
    jsonFiles.filter(f => isInEntry(f) && !isIgnored(f))
        .forEach(f => {
            const content = util.read(f, false);
            if (content == null || content.trim() === '') return;
            jsonPages.push(f);
        }   
    );

    util.print.cyan(htmlPages, 'htmlPages');
    util.print.magenta(jsonPages, 'jsonPages');
    util.print.cyan(htmlPartials, 'htmlPartials');
    // console.log(mergedConfigs.ignore, 'mergedConfigs.ignore');
    return 0;
}