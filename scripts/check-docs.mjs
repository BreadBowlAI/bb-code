import { access, readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const ignoredDirectories = new Set([".git", "dist", "node_modules"]);

async function markdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : markdownFiles(join(directory, entry.name));
    }
    return [join(directory, entry.name)];
  }));
  return nested.flat().filter((file) => [".md", ".mdx"].includes(extname(file)));
}

function localTarget(rawTarget) {
  const target = rawTarget.replace(/^<|>$/g, "");
  if (target.startsWith("#") || /^[a-z][a-z+.-]*:/i.test(target)) return undefined;
  return target.split(/[?#]/, 1)[0];
}

const missing = [];
for (const file of await markdownFiles(root)) {
  const source = await readFile(file, "utf8");
  const links = source.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g);
  for (const match of links) {
    const target = localTarget(match[1]);
    if (!target) continue;
    const absoluteTarget = target.startsWith("/") ? resolve(root, `.${target}`) : resolve(dirname(file), target);
    try {
      await access(absoluteTarget);
    } catch {
      missing.push(`${relative(root, file)} -> ${target}`);
    }
  }
}

if (missing.length) {
  process.stderr.write(`Missing local documentation targets:\n${missing.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Documentation links are valid.\n");
}
