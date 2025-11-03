#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');

const DEFAULT_INPUTS = ['themes'];
const DEFAULT_OUTPUT = 'catalog/index.generated.json';

const ARG_MAP = {
  '--input': 'inputs',
  '-i': 'inputs',
  '--output': 'output',
  '-o': 'output',
  '--version': 'version',
  '-v': 'version',
  '--summary': 'summary',
  '-s': 'summary',
  '--allow-missing-frontmatter': 'allowMissingFrontmatter'
};

const slugify = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

const localeCompare = (a, b) => a.localeCompare(b, 'zh-Hans-CN');

const parseArgs = (argv) => {
  const options = {
    inputs: [...DEFAULT_INPUTS],
    output: DEFAULT_OUTPUT,
    version: undefined,
    summary: undefined,
    allowMissingFrontmatter: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const key = ARG_MAP[arg];
    if (!key) {
      continue;
    }
    if (key === 'allowMissingFrontmatter') {
      options.allowMissingFrontmatter = true;
      continue;
    }
    const next = argv[i + 1];
    if (!next) {
      throw new Error(`Missing value for ${arg}`);
    }
    i += 1;
    if (key === 'inputs') {
      options.inputs = next.split(',').map((segment) => segment.trim()).filter(Boolean);
    } else {
      options[key] = next;
    }
  }
  return options;
};

const readFrontMatter = (contents) => {
  const normalized = contents.replace(/^\uFEFF/, '');
  const lines = normalized.split(/\r?\n/);
  if (lines.length === 0 || lines[0].trim() !== '---') {
    return null;
  }
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      closingIndex = i;
      break;
    }
  }
  if (closingIndex === -1) {
    return null;
  }
  const block = lines.slice(1, closingIndex).join('\n').trim();
  if (!block) {
    return null;
  }
  try {
    const data = JSON.parse(block);
    const body = lines.slice(closingIndex + 1).join('\n');
    return { data, body };
  } catch (error) {
    throw new Error(`Invalid JSON metadata: ${(error && error.message) || error}`);
  }
};

const ensureArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
};

const uniqueTags = (tags) => {
  const result = [];
  const seen = new Set();
  tags.forEach((tag) => {
    const text = String(tag).trim();
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(text);
  });
  return result;
};

const extractMetadata = async (filePath, options) => {
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = readFrontMatter(raw);
  if (!parsed) {
    if (options.allowMissingFrontmatter) {
      return null;
    }
    throw new Error('Missing front matter block (expected --- JSON --- at file start)');
  }

  const { data, body } = parsed;
  const errors = [];
  if (!data.themeId || typeof data.themeId !== 'string') {
    errors.push('themeId missing in metadata');
  }
  if (!data.title || typeof data.title !== 'string') {
    errors.push('title missing in metadata');
  }
  if (!data.description || typeof data.description !== 'string') {
    errors.push('description missing in metadata');
  }
  const tags = uniqueTags(ensureArray(data.tags));
  if (tags.length === 0) {
    errors.push('tags array is required in metadata');
  }
  if (errors.length) {
    throw new Error(errors.join('; '));
  }

  const stat = await fs.stat(filePath);
  const promptPath = path.relative(process.cwd(), filePath).split(path.sep).join('/');

  const metadata = {
    themeId: data.themeId || slugify(path.basename(filePath, path.extname(filePath))),
    title: data.title,
    description: data.description,
    tags,
    promptPath,
    lastUpdated: stat.mtime.toISOString()
  };

  if (data.primaryTag || tags.length) {
    metadata.primaryTag = data.primaryTag || tags[0];
  }
  if (data.keywords) {
    metadata.keywords = uniqueTags(ensureArray(data.keywords));
  }
  if (data.tone) {
    metadata.tone = String(data.tone);
  }
  if (data.maturity) {
    metadata.maturity = String(data.maturity);
  }
  if (data.series) {
    metadata.series = String(data.series);
  }
  if (body && body.trim()) {
    metadata.wordCount = body.trim().split(/\s+/).length;
  }

  return metadata;
};

const collectTxtFiles = async (targetPath) => {
  const files = [];
  const stat = await fs.stat(targetPath);
  if (stat.isFile()) {
    if (path.extname(targetPath).toLowerCase() === '.txt') {
      files.push(targetPath);
    }
    return files;
  }
  if (!stat.isDirectory()) {
    return files;
  }
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await collectTxtFiles(entryPath);
      files.push(...nested);
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.txt') {
      files.push(entryPath);
    }
  }
  return files;
};

const writeJsonFile = async (targetPath, payload) => {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const root = process.cwd();
  const inputPaths = options.inputs.length ? options.inputs : [...DEFAULT_INPUTS];
  const resolvedFiles = [];
  for (const input of inputPaths) {
    const absolute = path.resolve(root, input);
    try {
      const files = await collectTxtFiles(absolute);
      resolvedFiles.push(...files);
    } catch (error) {
      console.warn(`⚠️  Skipped ${input}: ${(error && error.message) || error}`);
    }
  }

  if (resolvedFiles.length === 0) {
    console.warn('No .txt files found. Nothing to do.');
    return;
  }

  const seen = new Set();
  const themes = [];
  const tagCounts = new Map();

  for (const filePath of resolvedFiles) {
    try {
      const metadata = await extractMetadata(filePath, options);
      if (!metadata) {
        continue;
      }
      if (seen.has(metadata.themeId)) {
        throw new Error(`Duplicate themeId detected: ${metadata.themeId}`);
      }
      seen.add(metadata.themeId);
      themes.push(metadata);
      metadata.tags.forEach((tag) => {
        const key = tag.toLowerCase();
        const current = tagCounts.get(key) ?? { tag, count: 0 };
        current.count += 1;
        current.tag = tag;
        tagCounts.set(key, current);
      });
    } catch (error) {
      console.error(`❌ ${path.relative(root, filePath)}: ${(error && error.message) || error}`);
      process.exitCode = 1;
      return;
    }
  }

  themes.sort((a, b) => localeCompare(a.title, b.title));
  const catalogVersion =
    options.version || `generated-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const summary = Array.from(tagCounts.values())
    .sort((a, b) => b.count - a.count || localeCompare(a.tag, b.tag));

  const catalog = {
    catalogVersion,
    generatedAt: new Date().toISOString(),
    themes,
    tagSummary: summary
  };

  const outputPath = path.resolve(root, options.output);
  await writeJsonFile(outputPath, catalog);
  console.log(`✅ Wrote ${themes.length} themes to ${path.relative(root, outputPath)}`);

  if (summary.length) {
    if (options.summary) {
      const summaryPath = path.resolve(root, options.summary);
      await writeJsonFile(summaryPath, summary);
      console.log(`ℹ️  Tag summary saved to ${path.relative(root, summaryPath)}`);
    } else {
      console.log('Top tags:', summary.slice(0, 10));
    }
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
