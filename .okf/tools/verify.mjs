import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { parseDocument, isMap, isSeq } from 'yaml';
import { parseMarkdown } from './bundle.mjs';
import { metadataChecks } from './check.mjs';

export const verificationUsage = 'Usage: node cli.mjs verify FILE.md [--by REVIEWER_ID] [--dry-run | --confirm-reviewed]';

function validate(text, now) {
    const parsed = parseMarkdown(text);
    if (parsed.error || !parsed.metadata) throw new Error(parsed.error || 'Expected an OKF concept with YAML frontmatter.');
    const errors = [];
    metadataChecks(parsed, now, (code, message, severity = 'error') => {
        if (severity === 'error') errors.push(message);
    });
    if (errors.length) throw new Error(errors.join('\n'));
}

export function prepareVerification(file, reviewer, now = new Date()) {
    file = path.resolve(file);
    if (path.extname(file).toLowerCase() !== '.md' || ['index.md', 'log.md'].includes(path.basename(file).toLowerCase())) throw new Error('Choose a concept .md file, not index.md or log.md.');
    if (!fs.lstatSync(file).isFile()) throw new Error('Choose a regular file, not a symlink or directory.');
    const id = reviewer.trim().replace(/^human:/, '');
    if (!/^[^\s:/\p{Cc}]+$/u.test(id)) throw new Error('Reviewer ID must be nonempty, with no whitespace, colon, slash or control characters (example: evan).');
    const original = fs.readFileSync(file, 'utf8');
    validate(original, now);
    const frontmatter = /^(\uFEFF?---\r?\n)([\s\S]*?)(\r?\n---(?:\r?\n|$))/.exec(original);
    if (!frontmatter) throw new Error('Expected an OKF concept with YAML frontmatter.');
    const newline = frontmatter[1].endsWith('\r\n') ? '\r\n' : '\n';
    const document = parseDocument(frontmatter[2]);
    const entry = { by: `human:${id}`, at: now.toISOString() };
    const previous = document.get('verified', true);
    if (previous && !isMap(previous) && !isSeq(previous)) throw new Error('verified must be a mapping or list.');
    if (isSeq(previous) && previous.anchor) throw new Error('Expand the anchored verified list before reviewing; appending could change metadata that aliases it.');
    if (isSeq(previous)) previous.add(document.createNode(entry));
    else {
        const sequence = document.createNode([]);
        if (previous) sequence.add(previous);
        sequence.add(document.createNode(entry));
        document.set('verified', sequence);
    }
    const yaml = document.toString({ lineWidth: 0 }).replace(/\n$/, '').replaceAll('\n', newline);
    const content = frontmatter[1] + yaml + original.slice(frontmatter[1].length + frontmatter[2].length);
    validate(content, now);
    return { file, original, content, entry };
}

export function saveVerification(plan) {
    if (!fs.lstatSync(plan.file).isFile() || fs.readFileSync(plan.file, 'utf8') !== plan.original) throw new Error('File changed during review; run verification again.');
    const temporary = `${plan.file}.${randomUUID()}.tmp`;
    try {
        fs.writeFileSync(temporary, plan.content, { flag: 'wx', mode: fs.statSync(plan.file).mode });
        fs.renameSync(temporary, plan.file);
    } finally {
        if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    }
}

export async function verify(file, flags, { input = process.stdin, output = process.stdout } = {}) {
    let reviewer, dryRun = false, confirmed = false;
    const seen = new Set();
    for (let i = 0; i < flags.length; i++) {
        const flag = flags[i];
        if (seen.has(flag)) throw new Error(verificationUsage);
        seen.add(flag);
        if (flag === '--by') {
            reviewer = flags[++i];
            if (reviewer === undefined || reviewer.startsWith('--')) throw new Error(verificationUsage);
        } else if (flag === '--dry-run') dryRun = true;
        else if (flag === '--confirm-reviewed') confirmed = true;
        else throw new Error(verificationUsage);
    }
    if (!file || file.startsWith('--') || (dryRun && confirmed)) throw new Error(verificationUsage);
    const interactive = !!input.isTTY && !!output.isTTY;
    if (!interactive && (reviewer === undefined || (!dryRun && !confirmed))) throw new Error('An interactive terminal is required, or supply --by ID and --dry-run / --confirm-reviewed after human review.');
    const prompt = interactive ? createInterface({ input, output }) : null;
    try {
        if (reviewer === undefined) reviewer = await prompt.question('Your reviewer ID (example: evan): ');
        const plan = prepareVerification(file, reviewer);
        output.write(`File: ${plan.file}\nAppend to verified:\n  - by: ${plan.entry.by}\n    at: ${plan.entry.at}\n`);
        if (dryRun) { output.write('Preview only; no file changed.\n'); return; }
        if (!confirmed) {
            const answer = await prompt.question('Have you personally checked this document against its sources or resource? Type yes to save: ');
            if (answer.trim().toLowerCase() !== 'yes') { output.write('Cancelled; no file changed.\n'); return; }
        }
        saveVerification(plan);
        output.write('Human verification recorded. Previous reviews retained.\n');
    } finally {
        prompt?.close();
    }
}
