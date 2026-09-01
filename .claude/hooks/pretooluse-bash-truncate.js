#!/usr/bin/env node
// PreToolUse hook (matcher: Bash). Rewrites tool_input.command so the command's
// own output is piped through truncate-stream.js before it comes back to Claude,
// instead of large build/test dumps landing verbatim in context.
const path = require('path');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { raw += d; });
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(raw); } catch { process.exit(0); }

  const cmd = input && input.tool_input && input.tool_input.command;
  if (!cmd) { process.exit(0); }

  const truncatorPath = path.join(__dirname, 'truncate-stream.js').replace(/\\/g, '/');
  const wrapped = `{\n${cmd}\n} 2>&1 | node "${truncatorPath}"; exit \${PIPESTATUS[0]}`;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      updatedInput: { command: wrapped }
    }
  }));
});
