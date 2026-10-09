import fs from 'node:fs';
import path from 'node:path';
import { anchors, diagnostic, links, loadBundle, mapping, markdown, nonempty, parseMarkdown, posix, profile, resolveLink } from './bundle.mjs';

function datetime(value) {
    if (typeof value !== 'string') return false;
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(value);
    if (!match || !Number.isFinite(Date.parse(value))) return false;
    const [, year, month, day, hour, minute, second, zoneHour, zoneMinute] = match.map((v, i) => i === 0 ? v : Number(v ?? 0));
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return month >= 1 && month <= 12 && day >= 1 && day <= days && hour < 24 && minute < 60 && second < 60 && zoneHour <= 23 && zoneMinute < 60;
}

function metadataChecks(doc, now, add) {
    const m = doc.metadata;
    for (const field of ['type', 'title', 'description']) {
        if (!nonempty(m[field])) add('required-field', `${field} must be a nonempty string.`);
    }
    if ('tags' in m && (!Array.isArray(m.tags) || m.tags.some(t => !nonempty(t)))) add('tags', 'tags must be a list of nonempty strings.');
    if ('resource' in m && !nonempty(m.resource)) add('resource', 'resource must be a nonempty URI or path.');
    if ('status' in m && !['draft', 'stable', 'deprecated'].includes(m.status)) add('status', 'Use draft, stable or deprecated; implementation state belongs in the dashboard.');
    const timestamp = (value, name) => {
        if (!datetime(value)) { add('timestamp', `${name} must be a valid ISO datetime with an explicit timezone.`); return false; }
        return true;
    };
    const actor = (value, name) => {
        if (!nonempty(value) || !/^(?:human:[^\s]+|process:[^\s]+|[^\s/:]+\/[^\s]+)$/.test(value)) add('actor', `${name} must identify human:id, process:id or producer/version.`);
    };
    const usageWindow = (value, name) => {
        if (!mapping(value)) { add('usage-window', `${name} must contain from and to datetimes.`); return; }
        const fromValid = timestamp(value.from, `${name}.from`);
        const toValid = timestamp(value.to, `${name}.to`);
        if (fromValid && toValid && Date.parse(value.from) > Date.parse(value.to)) add('usage-window', `${name}.from must not be later than to.`);
    };
    if ('usage_window' in m) usageWindow(m.usage_window, 'usage_window');
    if ('generated' in m) {
        if (!mapping(m.generated)) add('generated', 'generated must be a mapping.');
        else {
            actor(m.generated.by, 'generated.by');
            if ('at' in m.generated) timestamp(m.generated.at, 'generated.at');
        }
    }
    if ('verified' in m) {
        const entries = Array.isArray(m.verified) ? m.verified : [m.verified];
        if (!entries.length) add('verified', 'Omit verified when no verification exists.');
        for (const entry of entries) {
            if (!mapping(entry)) { add('verified', 'Each verification must be a mapping.'); continue; }
            actor(entry.by, 'verified.by');
            timestamp(entry.at, 'verified.at');
        }
        const latest = Math.max(...entries.map(e => Date.parse(e?.at)).filter(Number.isFinite));
        if (Number.isFinite(latest) && latest < Date.parse(m.generated?.at)) add('verification-age', 'All recorded verification predates the current content; review against its sources.', 'warning');
    }
    if ('stale_after' in m && timestamp(m.stale_after, 'stale_after') && +now >= Date.parse(m.stale_after)) add('stale', 'The review deadline has been reached; verify the content before extending it.', 'warning');
    if ('sources' in m) {
        if (!Array.isArray(m.sources)) add('sources', 'sources must be a list.');
        else {
            const ids = new Set();
            for (const source of m.sources) {
                if (!mapping(source) || !nonempty(source.resource)) { add('sources', 'Each source needs a nonempty resource.'); continue; }
                if ('id' in source) {
                    if (!nonempty(source.id) || ids.has(source.id)) add('sources', 'Source IDs must be nonempty and unique.');
                    ids.add(source.id);
                }
                if ('last_modified' in source) timestamp(source.last_modified, 'sources.last_modified');
                for (const field of ['title', 'author']) {
                    if (field in source && !nonempty(source[field])) add('sources', `sources.${field} must be a nonempty string.`);
                }
                if ('usage_count' in source && (!Number.isSafeInteger(source.usage_count) || source.usage_count < 0)) add('sources', 'sources.usage_count must be a nonnegative integer.');
                if ('usage_window' in source) usageWindow(source.usage_window, 'sources.usage_window');
            }
        }
    }
    if (m.type === 'Attested Computation' && !nonempty(m.runtime)) add('runtime', 'An Attested Computation needs runtime.');
}

function indexListings(body, add) {
    const entries = [];
    let headed = false;
    let depth = 0;
    let item = null;
    for (const token of markdown.parse(body, {})) {
        if (token.type === 'heading_open') headed = true;
        if (token.type === 'bullet_list_open') depth++;
        if (token.type === 'bullet_list_close') depth--;
        if (token.type === 'list_item_open' && depth === 1) item = { valid: false };
        if (token.type === 'inline' && item && depth === 1) {
            const children = token.children || [];
            const open = children.findIndex(t => t.type === 'link_open');
            const close = children.findIndex((t, i) => i > open && t.type === 'link_close');
            const suffix = children.slice(close + 1).map(t => t.content).join('').trim();
            if (headed && open >= 0 && close > open && /^[-–—]\s+\S/.test(suffix)) {
                entries.push(children[open].attrGet('href'));
                item.valid = true;
            }
        }
        if (token.type === 'list_item_close' && depth === 1 && item) {
            if (!item.valid) add('index-structure', 'Each index list entry needs a linked title and a description separated by a dash.');
            item = null;
        }
    }
    if (!headed || (links(body).length && !entries.length)) add('index-structure', 'An index needs headings and bullet-list entries with linked titles and descriptions.');
    return entries;
}

function logChecks(body, add) {
    const tokens = markdown.parse(body, {});
    let dates = 0;
    let entries = 0;
    let previous;
    let depth = 0;
    const finishGroup = () => { if (dates && !entries) add('log-structure', 'Every log date needs at least one list entry.'); };
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.type === 'heading_open' && token.tag === 'h2') {
            finishGroup();
            const date = tokens[i + 1].content;
            if (!datetime(`${date}T00:00:00Z`)) add('log-date', 'Log date headings must use real YYYY-MM-DD dates.');
            else if (previous && date >= previous) add('log-order', 'Group unique log dates newest first.');
            previous = date;
            dates++;
            entries = 0;
        }
        if (token.type === 'bullet_list_open') depth++;
        if (token.type === 'bullet_list_close') depth--;
        if (token.type === 'list_item_open') {
            if (!dates || depth !== 1) add('log-structure', 'Log entries must be a flat bullet list under a date.');
            entries++;
        }
        if (token.type === 'paragraph_open' && depth === 0) add('log-structure', 'Use date-grouped list entries in log.md.');
        if (token.type === 'heading_open' && !['h1', 'h2'].includes(token.tag)) add('log-structure', 'Use H2 date headings for log groups.');
    }
    finishGroup();
    if (!dates) add('log-structure', 'A log needs at least one dated group of list entries.');
}

export function check(project, { now = new Date(), proposedDocuments = new Map() } = {}) {
    const bundle = loadBundle(project);
    const output = [...bundle.diagnostics];
    if (!bundle.config) return output;
    for (const [file, content] of proposedDocuments) {
        const parsed = parseMarkdown(content);
        bundle.documents.set(file, { file, ...parsed });
        if (parsed.error) output.push(diagnostic(file, 'yaml', parsed.error));
    }
    const virtualFiles = new Map([...proposedDocuments].map(([file, content]) => [path.join(bundle.root, file), content]));
    const usedMissing = new Set();
    const expectedDirectories = new Set(['.']);
    const listings = new Map();
    for (const [file, doc] of bundle.documents) {
        const add = (code, message, severity) => output.push(diagnostic(file, code, message, severity));
        let directory = path.posix.dirname(file);
        while (directory !== '.') {
            expectedDirectories.add(directory);
            directory = path.posix.dirname(directory);
        }
        const base = path.posix.basename(file);
        if (doc.error) continue;
        if (base === 'index.md') {
            if (doc.hasFrontmatter && (file !== 'index.md' || Object.keys(doc.metadata).some(k => k !== 'okf_version'))) add('index-frontmatter', 'Only a root index may have frontmatter, containing only okf_version.');
            if (file === 'index.md' && doc.metadata?.okf_version !== profile.okfVersion) add('okf-version', `The profile requires okf_version: "${profile.okfVersion}" in the root index.`);
            listings.set(file, indexListings(doc.body, add));
        } else if (base === 'log.md') {
            if (doc.hasFrontmatter) add('log-frontmatter', 'log.md has no frontmatter.');
            logChecks(doc.body, add);
        } else if (!doc.hasFrontmatter) {
            if (Object.hasOwn(bundle.config.legacy, file)) add('legacy', bundle.config.legacy[file], 'warning');
            else add('frontmatter', 'Concept documents require YAML frontmatter.');
        } else metadataChecks(doc, now, add);

        for (const href of links(doc.body)) {
            const target = resolveLink(bundle, file, href);
            if (target.unsafe) { add('unsafe-link', `Link escapes the project or uses an unsupported path: ${href}`); continue; }
            if (target.external) continue;
            const virtual = virtualFiles.get(target.absolute);
            if (!target.exists && virtual === undefined) {
                const key = `${file} -> ${href}`;
                if (Object.hasOwn(bundle.config.missingLinks, key)) usedMissing.add(key);
                else add('missing-link', `Missing local target: ${href}`);
            } else if (target.fragment && target.absolute.endsWith('.md') && (virtual !== undefined || fs.statSync(target.absolute).isFile())) {
                const parsed = parseMarkdown(virtual ?? fs.readFileSync(target.absolute, 'utf8'));
                if (!anchors(parsed.body).has(target.fragment)) add('missing-anchor', `Missing Markdown heading: ${href}`);
            }
        }
    }
    for (const [file] of Object.entries(bundle.config.legacy)) {
        if (!bundle.documents.has(file) || bundle.documents.get(file).hasFrontmatter) output.push(diagnostic(file, 'unused-exception', 'Remove the obsolete legacy exception.', 'warning'));
    }
    for (const key of Object.keys(bundle.config.missingLinks)) {
        if (!usedMissing.has(key)) output.push(diagnostic('.okf.json', 'unused-exception', `Remove unused missingLinks entry: ${key}`, 'warning'));
    }
    for (const directory of expectedDirectories) {
        const index = path.posix.join(directory, 'index.md');
        const document = bundle.documents.get(index);
        if (!document) { output.push(diagnostic(index, 'missing-index', 'This documentation directory needs an index.')); continue; }
        const destinations = new Set((listings.get(index) || []).map(href => resolveLink(bundle, index, href)).filter(t => t.absolute && !t.unsafe).map(t => posix(path.relative(bundle.root, t.absolute))));
        for (const file of bundle.documents.keys()) {
            if (file === index || path.posix.basename(file) === 'log.md' || path.posix.dirname(file) !== directory) continue;
            if (!destinations.has(file)) output.push(diagnostic(index, 'index-entry', `List ${file} in this directory index.`));
        }
        for (const child of expectedDirectories) {
            if (child === '.' || path.posix.dirname(child) !== directory) continue;
            if (!destinations.has(child) && !destinations.has(`${child}/index.md`)) output.push(diagnostic(index, 'index-entry', `List ${child}/index.md in this directory index.`));
        }
    }
    return output;
}
