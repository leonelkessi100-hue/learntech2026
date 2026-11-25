/*
 * LearnTech English -> English staging translator.
 *
 * It deliberately translates only visible text and a small allow-list of
 * accessibility/metadata attributes. HTML tags, scripts, styles, URLs, image
 * paths, filenames, code blocks and technical identifiers remain unchanged.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('..', '..');
const staging = path.join(root, 'translated-staging');
const cachePath = path.join(root, '.translation-tools', 'translation-cache.json');
const skipTags = new Set(['script', 'style', 'pre', 'code', 'svg', 'textarea', 'template']);
const translatableAttributes = new Set(['title', 'placeholder', 'alt', 'aria-label']);
const EnglishMarkers = /\b(waxaa|waxaad|baro|sidee|sida|lacag|maqaalkan|qof|haddii|ugu|kugu|ayaa|iyo|ama|ku|ka|looga|sameeyaa|rabtaa|fudud)\b/iu;

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const isSkippableText = (value) => !value.trim() || /^(https?:\/\/|mailto:|tel:|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/.test(value.trim()) || /^[\d\s\p{P}\p{S}]+$/u.test(value);

async function getCache() {
  try { return JSON.parse(await readFile(cachePath, 'utf8')); }
  catch { return {}; }
}

async function translateBatch(items, cache) {
  const pending = items.filter((item) => !cache[item.text] || EnglishMarkers.test(cache[item.text]));
  for (let i = 0; i < pending.length;) {
    const batch = [];
    let size = 0;
    while (i < pending.length) {
      const item = pending[i];
      const marker = `[[[RB_TRANSLATION_${i}]]]`;
      const addition = marker.length + item.text.length + 4;
      if (batch.length && size + addition > 4200) break;
      batch.push({ ...item, marker });
      size += addition;
      i += 1;
    }
    const combined = batch.map(({ marker, text }) => `${marker}\n${text}`).join('\n\n');
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    url.searchParams.set('client', 'gtx');
    url.searchParams.set('sl', 'so');
    url.searchParams.set('tl', 'en');
    url.searchParams.append('dt', 't');
    url.searchParams.set('q', combined);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Translation request failed: ${response.status}`);
    const data = await response.json();
    const translated = data[0].map((segment) => segment[0]).join('');
    for (let position = 0; position < batch.length; position += 1) {
      const current = batch[position];
      const next = batch[position + 1];
      const start = translated.indexOf(current.marker) + current.marker.length;
      const end = next ? translated.indexOf(next.marker) : translated.length;
      if (start < current.marker.length || end < start) {
        throw new Error(`Translation marker was not preserved for: ${current.text.slice(0, 80)}`);
      }
      const candidate = translated.slice(start, end).trim();
      // Google occasionally preserves a source sentence inside a large mixed
      // batch. Retry that sentence alone before accepting the result.
      if (EnglishMarkers.test(candidate)) {
        const retryUrl = new URL('https://translate.googleapis.com/translate_a/single');
        retryUrl.searchParams.set('client', 'gtx');
        retryUrl.searchParams.set('sl', 'so');
        retryUrl.searchParams.set('tl', 'en');
        retryUrl.searchParams.append('dt', 't');
        retryUrl.searchParams.set('q', current.text);
        const retryResponse = await fetch(retryUrl);
        if (!retryResponse.ok) throw new Error(`Single-text retry failed: ${retryResponse.status}`);
        const retryData = await retryResponse.json();
        cache[current.text] = retryData[0].map((segment) => segment[0]).join('').trim();
      } else {
        cache[current.text] = candidate;
      }
    }
    console.log(`Translated ${Math.min(i, pending.length)}/${pending.length} new text blocks`);
    await new Promise((resolve) => setTimeout(resolve, 180));
  }
  return cache;
}

function extractFields(html) {
  const parts = html.split(/(<!--[\s\S]*?-->|<[^>]*>)/g);
  const fields = [];
  const stack = [];
  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    if (!part || part.startsWith('<!--')) continue;
    if (part.startsWith('<')) {
      const close = /^<\/\s*([\w:-]+)/.exec(part);
      const open = /^<\s*([\w:-]+)/.exec(part);
      if (close) { stack.pop(); continue; }
      if (!open) continue;
      const tagName = open[1].toLowerCase();
      if (!part.endsWith('/>') && !/^(meta|link|img|input|br|hr|source|area|base|embed|wbr)\b/i.test(tagName)) stack.push(tagName);
      if (!skipTags.has(tagName)) {
        const allowContent = tagName === 'meta' && /\b(?:name|property)=['"](?:description|keywords|og:title|og:description|twitter:title|twitter:description)['"]/i.test(part);
        const attributePattern = /\b([\w:-]+)=(['"])(.*?)\2/gi;
        let match;
        while ((match = attributePattern.exec(part))) {
          const name = match[1].toLowerCase();
          if (translatableAttributes.has(name) || (name === 'content' && allowContent)) {
            if (!isSkippableText(match[3])) fields.push({ kind: 'attribute', index, raw: match[3], text: match[3] });
          }
        }
      }
      continue;
    }
    if (!stack.some((tag) => skipTags.has(tag)) && !isSkippableText(part)) {
      const leading = part.match(/^\s*/)[0];
      const trailing = part.match(/\s*$/)[0];
      const text = part.slice(leading.length, part.length - trailing.length);
      if (text) fields.push({ kind: 'text', index, raw: part, text, leading, trailing });
    }
  }
  return { parts, fields };
}

function applyTranslations(parts, fields, cache) {
  for (const field of fields) {
    const output = cache[field.text];
    if (!output) throw new Error(`Missing translation for: ${field.text.slice(0, 80)}`);
    if (field.kind === 'text') parts[field.index] = `${field.leading}${output}${field.trailing}`;
    else parts[field.index] = parts[field.index].replace(field.raw, output);
  }
  return parts.join('');
}

function inspect(original, translated) {
  const tags = (value) => (value.match(/<!--[\s\S]*?-->|<[^>]*>/g) ?? []).filter((tag) => !tag.startsWith('<!--'));
  const originalTags = tags(original);
  const translatedTags = tags(translated);
  if (originalTags.length !== translatedTags.length) return 'HTML tag count changed';
  const protectedBlocks = (value) => value.match(/<(script|style|pre|code)\b[\s\S]*?<\/\1>/gi) ?? [];
  if (sha256(protectedBlocks(original).join('\n')) !== sha256(protectedBlocks(translated).join('\n'))) return 'Protected code/style block changed';
  const originalRefs = [...original.matchAll(/\b(?:src|href)=(['"])(.*?)\1/gi)].map((match) => match[2]).join('\n');
  const translatedRefs = [...translated.matchAll(/\b(?:src|href)=(['"])(.*?)\1/gi)].map((match) => match[2]).join('\n');
  if (originalRefs !== translatedRefs) return 'URL, link, or asset reference changed';
  const remaining = extractFields(translated).fields
    .map((field) => field.text)
    .find((text) => EnglishMarkers.test(text));
  if (remaining) return `English marker remains: ${remaining.slice(0, 160)}`;
  return null;
}

await mkdir(staging, { recursive: true });
const cache = await getCache();
const pages = (await readdir(root)).filter((name) => name.endsWith('.html'));
const completedPages = new Set((await readdir(staging)).filter((name) => name.endsWith('.html')));
const report = [];
for (const page of pages) {
  const source = await readFile(path.join(root, page), 'utf8');
  if (completedPages.has(page)) {
    const staged = await readFile(path.join(staging, page), 'utf8');
    const existingProblem = inspect(source, staged);
    if (existingProblem) throw new Error(`${page}: existing staging page failed verification — ${existingProblem}`);
    report.push({ page, fields: extractFields(source).fields.length, status: 'already-verified' });
    console.log(`Kept verified staging page: ${page}`);
    continue;
  }
  const { parts, fields } = extractFields(source);
  const unique = [...new Map(fields.map((field) => [field.text, field])).values()];
  await translateBatch(unique, cache);
  const output = applyTranslations(parts, fields, cache);
  const problem = inspect(source, output);
  if (problem) throw new Error(`${page}: verification failed — ${problem}`);
  await writeFile(path.join(staging, page), output, 'utf8');
  report.push({ page, fields: fields.length, status: 'verified' });
  await writeFile(cachePath, JSON.stringify(cache, null, 2), 'utf8');
  console.log(`Verified staging page: ${page} (${fields.length} translated fields)`);
}
await writeFile(path.join(staging, 'translation-report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(`SUCCESS: ${report.length} pages translated and verified in ${staging}`);
