// Dependency-free helpers for reading which OKF snapshot a project pins. install.mjs
// imports this module, so it must never import the parser dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const sourceDirectory = path.dirname(fileURLToPath(import.meta.url));
const readJson = file => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

export function currentSnapshot() {
    return {
        profile: readJson(path.join(sourceDirectory, 'profile.json')).profile,
        version: readJson(path.join(sourceDirectory, 'package.json')).version,
    };
}

// What a project pins: the profile in .okf.json and the vendored tools' own versions.
export function pinnedSnapshot(project) {
    const config = readJson(path.join(project, '.okf.json'));
    const toolsDirectory = path.join(project, '.okf', 'tools');
    const toolsProfile = readJson(path.join(toolsDirectory, 'profile.json'))?.profile ?? null;
    const toolsVersion = readJson(path.join(toolsDirectory, 'package.json'))?.version ?? null;
    return { configured: config !== null && typeof config === 'object', profile: config?.profile ?? null, toolsProfile, toolsVersion, hasTools: fs.existsSync(toolsDirectory) };
}

export function isOutdated(pinned, current = currentSnapshot()) {
    if (!pinned.configured) return false;
    return pinned.profile !== current.profile
        || (pinned.hasTools && (pinned.toolsVersion !== current.version || pinned.toolsProfile !== current.profile));
}

export function workspaceProjects(workspace) {
    const names = fs.readdirSync(workspace, { withFileTypes: true })
        .filter(e => e.isDirectory() && !e.name.startsWith('.') && fs.existsSync(path.join(workspace, e.name, '.git')) && fs.existsSync(path.join(workspace, e.name, '.okf.json')))
        .map(e => e.name).sort((a, b) => a.localeCompare(b, 'en'));
    return names.map(name => ({ name, path: path.join(workspace, name) }));
}

export function outdatedProjects(workspace) {
    const current = currentSnapshot();
    return workspaceProjects(workspace).filter(p => isOutdated(pinnedSnapshot(p.path), current));
}
