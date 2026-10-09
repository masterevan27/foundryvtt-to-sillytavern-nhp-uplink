import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import MarkdownIt from 'markdown-it';

export const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
export const profile = JSON.parse(fs.readFileSync(path.join(toolDirectory, 'profile.json'), 'utf8'));
export const markdown = new MarkdownIt({ html: false });
export const posix = value => value.split(path.sep).join('/');
export const mapping = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const nonempty = value => typeof value === 'string' && value.trim().length > 0;
export const within = (root, target) => {
    const relative = path.relative(root, target);
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};
export function diagnostic(file, code, message, severity = 'error') {
    return { severity, file, code, message };
}

export function parseMarkdown(text) {
    text = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
    if (!/^---\n/.test(text)) return { body: text, metadata: null, hasFrontmatter: false };
    const end = text.indexOf('\n---', 4);
    if (end < 0 || !/^\n---(?:\n|$)/.test(text.slice(end))) {
        return { body: '', metadata: null, hasFrontmatter: true, error: 'Unclosed YAML frontmatter.' };
    }
    try {
        const document = parseDocument(text.slice(4, end), { uniqueKeys: true });
        if (document.errors.length || document.warnings.length) {
            throw new Error([...document.errors, ...document.warnings].map(e => e.message).join('; '));
        }
        const metadata = document.toJS({ maxAliasCount: 20 });
        if (!mapping(metadata)) throw new Error('Frontmatter must be a YAML mapping.');
        return { body: text.slice(end + 4).replace(/^\n/, ''), metadata, hasFrontmatter: true };
    } catch (error) {
        return { body: '', metadata: null, hasFrontmatter: true, error: error.message };
    }
}

export function links(body) {
    const values = [];
    function visit(tokens) {
        for (const token of tokens) {
            if (token.type === 'link_open') values.push(token.attrGet('href'));
            if (token.type === 'image') values.push(token.attrGet('src'));
            if (token.children) visit(token.children);
        }
    }
    visit(markdown.parse(body, {}));
    return values;
}

export function anchors(body) {
    const result = new Set();
    const counts = new Map();
    const tokens = markdown.parse(body, {});
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type !== 'heading_open') continue;
        const children = tokens[i + 1]?.children || [];
        const text = children.filter(t => ['text', 'code_inline', 'image'].includes(t.type)).map(t => t.content).join('');
        const slug = text.toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\s-]/gu, '').replace(/\s/g, '-');
        let unique = slug;
        let suffix = counts.get(slug) || 0;
        while (result.has(unique)) unique = `${slug}-${++suffix}`;
        counts.set(slug, suffix);
        result.add(unique);
    }
    return result;
}

export function resolveLink(bundle, source, href) {
    if (/^[a-zA-Z]:[\\/]/.test(href) || href.includes('\\') || href.startsWith('//')) return { unsafe: true };
    if (/^[a-zA-Z][\w+.-]*:/.test(href)) {
        return /^(https?:|mailto:|tel:)/i.test(href) ? { external: true } : { unsafe: true };
    }
    let pathname, fragment;
    try {
        const hash = href.indexOf('#');
        const before = hash < 0 ? href : href.slice(0, hash);
        pathname = decodeURIComponent(before.split('?')[0]);
        fragment = hash < 0 ? '' : decodeURIComponent(href.slice(hash + 1));
    } catch { return { unsafe: true }; }
    if (pathname.includes('\0') || pathname.includes('\\') || /^[a-zA-Z]:/.test(pathname) || pathname.startsWith('//')) return { unsafe: true };
    const absolute = pathname.startsWith('/')
        ? path.resolve(bundle.root, `.${pathname}`)
        : path.resolve(path.dirname(path.join(bundle.root, source)), pathname || path.basename(source));
    if (!within(bundle.project, absolute)) return { unsafe: true };
    // Check existing ancestors too: a missing leaf must not hide a junction escape.
    let ancestor = absolute;
    while (!fs.existsSync(ancestor) && ancestor !== path.dirname(ancestor)) ancestor = path.dirname(ancestor);
    if (!within(bundle.project, fs.realpathSync(ancestor))) return { unsafe: true };
    return { absolute, fragment, exists: fs.existsSync(absolute) };
}

export function loadBundle(project) {
    project = fs.realpathSync(project);
    const diagnostics = [];
    const documents = new Map();
    const bundle = { project, root: null, config: null, documents, diagnostics };
    try {
        const configPath = path.join(project, '.okf.json');
        if (fs.lstatSync(configPath).isSymbolicLink()) throw new Error('.okf.json must not be a symlink.');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (!mapping(config)) throw new Error('Expected an object.');
        for (const key of Object.keys(config)) {
            if (!['profile', 'bundle', 'legacy', 'missingLinks'].includes(key)) throw new Error(`Unknown configuration key: ${key}`);
        }
        if (config.profile !== profile.profile) throw new Error(`Use profile ${profile.profile}; found ${config.profile}.`);
        if (!nonempty(config.bundle) || config.bundle.includes('\\') || config.bundle.includes(':') || path.isAbsolute(config.bundle)) throw new Error('bundle must be a relative POSIX directory.');
        const root = path.resolve(project, config.bundle);
        if (root === project || !within(project, root)) throw new Error('bundle must be a directory inside the repository.');
        if (!fs.statSync(root).isDirectory() || !within(project, fs.realpathSync(root))) throw new Error('bundle escapes the repository or is not a directory.');
        let component = root;
        while (component !== project) {
            if (fs.lstatSync(component).isSymbolicLink()) throw new Error('bundle path must not contain symlinks.');
            component = path.dirname(component);
        }
        for (const name of ['legacy', 'missingLinks']) {
            config[name] ??= {};
            if (!mapping(config[name]) || Object.values(config[name]).some(v => !nonempty(v))) throw new Error(`${name} must map exact paths/links to nonempty reasons.`);
        }
        for (const file of Object.keys(config.legacy)) {
            if (file.startsWith('/') || file.includes('\\') || file.split('/').includes('..') || !file.endsWith('.md') || ['index.md', 'log.md'].includes(path.posix.basename(file))) throw new Error(`Invalid legacy concept path: ${file}`);
        }
        bundle.root = root;
        bundle.config = config;
    } catch (error) {
        diagnostics.push(diagnostic('.okf.json', 'config', error.message));
        return bundle;
    }
    function walk(directory) {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
            const absolute = path.join(directory, entry.name);
            const relative = posix(path.relative(bundle.root, absolute));
            if (entry.isSymbolicLink()) {
                diagnostics.push(diagnostic(relative, 'symlink', 'Bundle entries must not be symlinks.'));
            } else if (entry.isDirectory()) {
                walk(absolute);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                const parsed = parseMarkdown(fs.readFileSync(absolute, 'utf8'));
                documents.set(relative, { file: relative, ...parsed });
                if (parsed.error) diagnostics.push(diagnostic(relative, 'yaml', parsed.error));
            }
        }
    }
    walk(bundle.root);
    return bundle;
}
