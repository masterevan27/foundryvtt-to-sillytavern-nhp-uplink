#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const label = d => `${d.severity}: ${d.file} [${d.code}] ${d.message}`;
const counts = result => result?.ok ? `${result.errors} error(s), ${result.warnings} warning(s)` : `unavailable (${result?.problem ?? 'not run'})`;

function printUpgrade(report) {
    const pin = v => v ? `profile ${v.profile}, tools ${v.toolsVersion ?? 'none'}` : 'unknown';
    console.log(`${report.dryRun ? 'Dry run: ' : ''}${report.project}`);
    console.log(`From ${pin(report.from)} to ${pin(report.to)}`);
    if (report.status === 'migration-required') { for (const line of report.steps) console.log(line); return; }
    const changed = report.files.filter(f => f.change !== 'unchanged');
    console.log(`${report.dryRun ? 'Would change' : 'Changed'} ${changed.length} snapshot file(s)${changed.length ? `: ${changed.map(f => `${f.file.replace('.okf/tools/', '')} (${f.change})`).join(', ')}` : ''}`);
    console.log(`.okf.json: ${report.config}; CI workflow: ${report.workflow}`);
    console.log(`Before: ${counts(report.before)}`);
    console.log(`After:  ${counts(report.after)}`);
    for (const d of report.newFindings) console.log(`NEW ${label(d)}`);
    for (const note of report.notes) console.log(`note: ${note}`);
    console.log(report.dryRun ? 'Nothing was written.' : 'Nothing was committed; review the diff and commit the upgrade on its own.');
}

async function main() {
    // Resolve direct dependencies before loading the runtime's static imports.
    // Errors in the runtime or a parser's own dependencies retain their diagnostics.
    for (const dependency of ['yaml', 'markdown-it']) {
        try {
            import.meta.resolve(dependency);
        } catch (error) {
            if (error.code !== 'ERR_MODULE_NOT_FOUND' || !error.message.startsWith(`Cannot find package '${dependency}' imported from `)) throw error;
            const directory = path.dirname(fileURLToPath(import.meta.url));
            throw new Error(`OKF parser dependency '${dependency}' is missing; run: npm ci --prefix "${directory}" --ignore-scripts --no-audit --no-fund`);
        }
    }
    const { check } = await import('./check.mjs');
    const { index, init, inventory, upgrade } = await import('./scaffold.mjs');
    const { verify, verificationUsage } = await import('./verify.mjs');
    const usage = `Usage: node cli.mjs check|index|init|inventory|upgrade PATH [flags]; check takes [--json]
       node cli.mjs inventory WORKSPACE [--json] [--outdated]
       node cli.mjs upgrade PROJECT [--dry-run] [--json]
${verificationUsage}`;
    const [command, target, ...flags] = process.argv.slice(2);
    if (command === 'verify') return verify(target, flags);
    const allowed = { check: ['--json'], index: [], init: [], inventory: ['--json', '--outdated'], upgrade: ['--json', '--dry-run'] }[command];
    if (!allowed || !target || target.startsWith('--') || flags.some(f => !allowed.includes(f)) || new Set(flags).size !== flags.length) throw new Error(usage);
    const project = path.resolve(target);
    if (command === 'check') {
        const diagnostics = check(project);
        const errors = diagnostics.filter(d => d.severity === 'error').length;
        const warnings = diagnostics.filter(d => d.severity === 'warning').length;
        if (flags.includes('--json')) console.log(JSON.stringify({ project, errors, warnings, diagnostics }, null, 2));
        else {
            for (const d of diagnostics) console.log(`${d.severity}: ${d.file} [${d.code}] ${d.message}`);
            console.log(`OKF: ${errors} error(s), ${warnings} warning(s).`);
        }
        process.exitCode = errors ? 1 : 0;
    } else if (command === 'index') console.log(`Updated ${index(project)} index file(s).`);
    else if (command === 'init') {
        console.log(`Created ${init(project)} files in ${project}.`);
        console.log('Next: customize docs/overview.md; add README/AGENTS links to docs/index.md.');
        console.log('In the target project run: npm ci --prefix .okf/tools --ignore-scripts --no-audit --no-fund');
        console.log('Then run: node .okf/tools/cli.mjs check .');
    } else if (command === 'upgrade') {
        const report = upgrade(project, { dryRun: flags.includes('--dry-run') });
        if (flags.includes('--json')) console.log(JSON.stringify(report, null, 2));
        else printUpgrade(report);
        process.exitCode = report.status === 'migration-required' ? 1 : report.after && !report.after.ok ? 1 : report.after?.errors ? 1 : 0;
    } else {
        const projects = inventory(project, { outdatedOnly: flags.includes('--outdated') });
        if (flags.includes('--json')) console.log(JSON.stringify(projects, null, 2));
        else for (const p of projects) {
            const pin = p.profile ? `; profile ${p.profile}, tools ${p.toolsVersion ?? 'none'}` : '';
            const findings = p.errors === null ? 'findings not checked (run upgrade --dry-run)' : `${p.errors} errors, ${p.warnings} warnings`;
            console.log(`${p.name}: ${p.adoption}${pin}; ${p.documents} documents; ${findings}`);
        }
    }
}

try {
    await main();
} catch (error) {
    console.error(error.message);
    process.exitCode = 2;
}
