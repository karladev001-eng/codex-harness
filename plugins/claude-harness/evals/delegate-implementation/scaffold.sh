#!/bin/sh
# A committed repository so the coordinator can isolate the worker in a worktree.
set -e
git init -q -b main
git config user.email eval@example.invalid
git config user.name eval
printf '{\n  "name": "calc",\n  "type": "commonjs",\n  "scripts": { "test": "node --test" }\n}\n' > package.json
printf 'exports.add = (a, b) => a + b;\n' > calc.js
git add -A && git commit -qm init
