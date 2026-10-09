// Supplemental validation for maintained concepts whose existing paths are
// outside docs/. The unmodified pinned CLI continues to validate the bundle.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchors, links, loadBundle, nonempty, parseMarkdown, resolveLink, within } from './tools/bundle.mjs';

const project = fs.realpathSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const bundle = loadBundle(project);
if (!bundle.config) throw new Error(bundle.diagnostics.map(d => d.message).join('\n'));
const files = JSON.parse(fs.readFileSync(path.join(project, '.okf/external-docs.json'), 'utf8'));
if (!Array.isArray(files) || files.some(file => !nonempty(file)) || new Set(files).size !== files.length) {
    throw new Error('external-docs.json must be a list of unique repository-relative Markdown paths.');
}
const errors = [];
for (const file of files) {
    const absolute = path.resolve(project, file);
    const fail = message => errors.push(`${file}: ${message}`);
    if (path.isAbsolute(file) || file.includes('\\') || !file.endsWith('.md') || !within(project, absolute) || within(bundle.root, absolute)) {
        fail('Expected a contained repository-relative Markdown path outside the bundle.');
        continue;
    }
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) { fail('Missing document.'); continue; }
    if (!within(project, fs.realpathSync(absolute))) { fail('Document resolves outside the repository.'); continue; }
    const doc = parseMarkdown(fs.readFileSync(absolute, 'utf8'));
    if (doc.error || !doc.hasFrontmatter) { fail(doc.error || 'Concept requires YAML frontmatter.'); continue; }
    for (const field of ['type', 'title', 'description']) {
        if (!nonempty(doc.metadata[field])) fail(`${field} must be a nonempty string.`);
    }
    if ('status' in doc.metadata && !['draft','stable','deprecated'].includes(doc.metadata.status)) fail('Invalid document lifecycle status.');
    const source = path.relative(bundle.root, absolute).split(path.sep).join('/');
    for (const href of links(doc.body)) {
        const target = resolveLink(bundle, source, href);
        if (target.unsafe) { fail(`Unsafe local link: ${href}`); continue; }
        if (target.external) continue;
        if (!target.exists) { fail(`Missing local target: ${href}`); continue; }
        if (target.fragment && target.absolute.endsWith('.md') && fs.statSync(target.absolute).isFile()) {
            const parsed = parseMarkdown(fs.readFileSync(target.absolute, 'utf8'));
            if (!anchors(parsed.body).has(target.fragment)) fail(`Missing Markdown heading: ${href}`);
        }
    }
}
for (const error of errors) console.error(error);
console.log(`${files.length} external concepts checked; ${errors.length} errors.`);
process.exitCode = errors.length ? 1 : 0;
