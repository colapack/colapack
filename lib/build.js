import path from 'node:path';
import util from '../util/__index.js';

let defaultConfig,
    packageConfig,
    qpurtConfig,
    mergedConfigs,
    entryPath,
    outputPath,
    isInEntry,
    ignorePaths,
    isIgnored,
    isPartial,
    htmlFiles,
    jsonFiles,
    jsonGlobal,
    htmlPartials=[],
    htmlPages=[],
    jsonPages=[];

const htmlDataX = util.colax();
const htmlPartialsX = util.colax('$');
const htmlPartialIdX = util.colax('!');

function getNestedPath(obj, pathStr) { return pathStr.split('.').reduce((acc, key) => acc?.[key], obj) }
function getFilename(f) { return path.basename(f, path.extname(f)) }

const red = '\x1b[31m';
const cyan = '\x1b[36m';
const yellow = '\x1b[33m';
const reset = '\x1b[0m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';

function validateFormat(f, issues) {
    issues.forEach(issue => {
        let message = `${red}${issue.severity}:${reset} ${issue.message} ${red}${dim}[${path.relative(process.cwd(), f)} [${issue.line}]]${reset}`
        util.print(message);
        // util.print.yellow(f);
    })
}

export default function build(apiConfig=undefined) {
    util.print.cyan(`${bold}start colapack build...${reset}`)

    defaultConfig = {
        entry: 'src',
        output: 'dist',
        ignore: []
    }

    try { packageConfig = util.read('package.json').qpurtConfig?.build } 
    catch { packageConfig = undefined }

    try { qpurtConfig = util.read('qpurt.json').build } 
    catch { qpurtConfig = undefined }

    // Merge order
    mergedConfigs = util.merge(
        {},
        defaultConfig,
        ...[packageConfig, qpurtConfig, apiConfig].filter(x => x != null)
    );

    // For now, we'll continue to use the invalid configs
    // until we write a validator to make sure we have proper 
    // error handling on user config errors.
    htmlFiles = util.find(process.cwd(), '.html');
    jsonFiles = util.find(process.cwd(), '.json');

    entryPath = path.resolve(process.cwd(), mergedConfigs.entry);
    outputPath = path.resolve(process.cwd(), mergedConfigs.output);

    isInEntry = (filePath) => filePath === entryPath || filePath.startsWith(entryPath + path.sep);
    ignorePaths = (mergedConfigs.ignore || []).map(p =>path.resolve(process.cwd(), p));
    isIgnored = (filePath) => ignorePaths.some(ignored => filePath.startsWith(ignored));
    isPartial = (content) => [...content.matchAll(htmlPartialIdX)].some(m => m[1] === 'partial');htmlPartialIdX.lastIndex = 0;
    const stripComments = (str) => str.replace(/<!--[\s\S]*?-->/g, '');

    // Run through entry(all html) and ignore configured files
    htmlFiles.filter(f => isInEntry(f) && !isIgnored(f)).forEach(f => {
        const content = util.read(f);
        if (content == null || content.trim() === '') return;
        isPartial(content) ? htmlPartials.push(f) : htmlPages.push(f);
    });

    // Run through entry(all json) and ignore configured files
    jsonFiles.filter(f => isInEntry(f) && !isIgnored(f)).forEach(f => {
        const content = util.read(f, false);
        if (content == null || content.trim() === '') return;
        if (path.basename(f) === '__global.json') jsonGlobal = util.read(f);
        jsonPages.push(f);
    });

    htmlPages.forEach(f => {
        const htmlDataMatches = [...util.read(f).matchAll(htmlDataX)];
        const htmlPartialMatches = [...util.read(f).matchAll(htmlPartialsX)];
        let htmlDataMerged;
        let file = stripComments(util.read(f));
        let filePath = path.join(outputPath, path.relative(entryPath, f));
        let detections = util.html.validate(file);

        if (htmlDataMatches.length === 0 && htmlPartialMatches.length === 0) {
            if (apiConfig && apiConfig.minify) file = util.html.minify(file);
            else file = util.html.pretty(file, { indentSize: 1 });

            if (detections.length !== 0) {
                validateFormat(f, detections);
                util.print.yellow(`${f} was not built due to validation issues.\n`)
            } else {
                // console.log('copy file to dist...')
            }

            return;
        }


        htmlPartialMatches.forEach(m => {
            htmlPartials.forEach(p => {
                if (m[1] === getFilename(p)) {
                    let partialData = util.read(p);
                    partialData = partialData.replace(htmlPartialIdX, '');
                    file = file.replace(m[0], partialData);
                }
            });
        });htmlPartialsX.lastIndex = 0;

        htmlDataMatches.forEach(m => { 
            jsonPages.forEach(d => {
                if (getFilename(d) === getFilename(f) && jsonGlobal) {
                    htmlDataMerged = util.merge(jsonGlobal, util.read(d));
                } else if (getFilename(d) === getFilename(f) && !jsonGlobal) {
                    htmlDataMerged = util.read(d);
                }
            });

            const value = getNestedPath(htmlDataMerged, m[1]);

            if (value === undefined) {
                file = file.replace(m[0], value);
                util.print.red(`warning: ${m[0]} undefined in ${f}`);
            } else if (typeof value === 'object') {
                file = file.replace(m[0], value);
                util.print.red(`warning: ${m[0]} object/array in ${f}`);
            } else {
                file = file.replace(m[0], () => String(value));
            }

        });htmlDataX.lastIndex = 0;

        if (apiConfig && apiConfig.minify) file = util.html.minify(file);
        else file = util.html.pretty(file, { indentSize: 1 });

        if (detections.length !== 0) {
            // util.print(detections);
            validateFormat(f, detections);
            util.print.yellow(`${f} was not built due to validation issues.\n`)
            // util.print(f);
            // util.print.red('--------------------');
        } else {
            util.write(filePath, file);
        }

        // util.print.green(detections, filePath);
    });

    return 0;
}