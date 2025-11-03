#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');

const TARGET_DIR = process.argv[2] || 'themes';

const KEYWORD_TAGS = [
  { keyword: '校园', tag: '校园' },
  { keyword: '校', tag: '校园' },
  { keyword: '豪门', tag: '豪门' },
  { keyword: '宫', tag: '宫廷' },
  { keyword: '后宫', tag: '后宫' },
  { keyword: '末日', tag: '末日' },
  { keyword: '娱乐圈', tag: '娱乐圈' },
  { keyword: '明星', tag: '娱乐圈' },
  { keyword: '灵异', tag: '灵异' },
  { keyword: '恐怖', tag: '恐怖' },
  { keyword: '无限流', tag: '无限流' },
  { keyword: '恋综', tag: '恋综' },
  { keyword: '快穿', tag: '快穿' },
  { keyword: '古代', tag: '古风' },
  { keyword: '古风', tag: '古风' },
  { keyword: '种田', tag: '种田' },
  { keyword: '修仙', tag: '仙侠' },
  { keyword: '仙侠', tag: '仙侠' },
  { keyword: '权谋', tag: '权谋' },
  { keyword: '复仇', tag: '复仇' },
  { keyword: '女帝', tag: '女帝' },
  { keyword: '扶摇', tag: '仙侠' },
  { keyword: '综艺', tag: '综艺' },
  { keyword: '直播', tag: '直播' },
  { keyword: '系统', tag: '系统' },
  { keyword: '末世', tag: '末日' },
  { keyword: '赛博', tag: '科幻' },
  { keyword: '科幻', tag: '科幻' },
  { keyword: '皇', tag: '宫廷' },
  { keyword: '帝', tag: '权谋' },
  { keyword: '仙', tag: '仙侠' },
  { keyword: '综', tag: '综艺' },
  { keyword: '职场', tag: '职场' },
  { keyword: '恋爱', tag: '恋爱' },
  { keyword: '逆袭', tag: '逆袭' },
  { keyword: '选秀', tag: '选秀' }
];

const hasFrontMatter = (content) => {
  const trimmed = content.trimStart();
  return trimmed.startsWith('---');
};

const parseFrontMatter = (content) => {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith('---')) {
    return null;
  }
  const lines = trimmed.split(/\r?\n/);
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
  const block = lines.slice(1, closingIndex).join('\n');
  try {
    const data = JSON.parse(block);
    return data;
  } catch (error) {
    return null;
  }
};

const slugify = (value) => {
  if (!value) return '';
  const ascii = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  if (ascii) {
    return ascii.slice(0, 64);
  }
  const hex = Buffer.from(value).toString('hex');
  return `theme-${hex.slice(0, 24)}`;
};

const inferTags = (text) => {
  const matches = [];
  KEYWORD_TAGS.forEach(({ keyword, tag }) => {
    if (text.includes(keyword)) {
      matches.push(tag);
    }
  });
  if (matches.length === 0) {
    matches.push('待分类');
  }
  return Array.from(new Set(matches));
};

const extractDescription = (content) => {
  const firstLine = content.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine) {
    return '待补充描述';
  }
  return firstLine.trim().slice(0, 120);
};

const ensureUniqueId = (baseId, usedIds) => {
  let id = baseId || 'theme-auto';
  if (!usedIds.has(id)) {
    usedIds.add(id);
    return id;
  }
  let counter = 2;
  while (usedIds.has(`${id}-${counter}`)) {
    counter += 1;
  }
  const uniqueId = `${id}-${counter}`;
  usedIds.add(uniqueId);
  return uniqueId;
};

const processFile = async (filePath, raw, usedIds) => {
  const title = path.basename(filePath, path.extname(filePath));
  const description = extractDescription(raw);
  const tags = inferTags(`${title}\n${raw}`);
  const metadata = {
    themeId: ensureUniqueId(slugify(title), usedIds),
    title,
    description,
    tags,
    primaryTag: tags[0]
  };
  const serialized = `---\n${JSON.stringify(metadata, null, 2)}\n---\n\n${raw.trimStart()}`;
  await fs.writeFile(filePath, serialized, 'utf8');
  return metadata;
};

const walk = async (targetPath) => {
  const stat = await fs.stat(targetPath);
  if (stat.isFile()) {
    if (path.extname(targetPath).toLowerCase() === '.txt') {
      return [targetPath];
    }
    return [];
  }
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await walk(entryPath);
      files.push(...nested);
    } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.txt') {
      files.push(entryPath);
    }
  }
  return files;
};

const main = async () => {
  const absolute = path.resolve(process.cwd(), TARGET_DIR);
  const files = await walk(absolute);
  if (!files.length) {
    console.log('No .txt files found');
    return;
  }
  const usedIds = new Set();
  const cache = new Map();
  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8');
    cache.set(file, raw);
    if (hasFrontMatter(raw)) {
      const data = parseFrontMatter(raw);
      if (data?.themeId) {
        usedIds.add(String(data.themeId));
      }
    }
  }
  let updated = 0;
  for (const file of files) {
    const raw = cache.get(file);
    if (hasFrontMatter(raw)) {
      continue;
    }
    const metadata = await processFile(file, raw, usedIds).catch((error) => {
      console.error(`Failed to update ${path.relative(process.cwd(), file)}: ${error.message}`);
      return null;
    });
    if (metadata) {
      updated += 1;
      console.log(`Added metadata to ${path.relative(process.cwd(), file)} -> ${metadata.themeId}`);
    }
  }
  console.log(`Done. Updated ${updated} files.`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
