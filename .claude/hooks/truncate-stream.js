#!/usr/bin/env node
// Reads a command's merged stdout+stderr from stdin and, if it exceeds LIMIT
// characters, keeps the first HEAD and last TAIL chars with a marker in between.
// Invoked as the tail of a pipeline by pretooluse-bash-truncate.js.
const LIMIT = 20000;
const HEAD = 8000;
const TAIL = 8000;

let s = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', d => { s += d; });
process.stdin.on('end', () => {
  if (s.length <= LIMIT) {
    process.stdout.write(s);
    return;
  }
  const omitted = s.length - HEAD - TAIL;
  process.stdout.write(s.slice(0, HEAD));
  process.stdout.write(`\n\n... [PreToolUse hook truncated ${omitted} chars of output] ...\n\n`);
  process.stdout.write(s.slice(-TAIL));
});
