import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const ts = require(path.join(projectRoot, 'client', 'node_modules', 'typescript'));
const scanRoots = [path.join(projectRoot, 'client', 'src'), path.join(projectRoot, 'server')];
const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
const forbiddenTerms = ['พัสดุ', 'สินค้า', 'อะไหล่', 'สินทรัพย์', 'ทรัพย์สิน', 'ธุรกรรม'];
const allowedInternalValues = new Set(['รออะไหล่']);

const filesIn = (directory) => {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesIn(entryPath);
    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
};

const sourceKindFor = (filePath) => {
  const extension = path.extname(filePath);
  if (extension === '.tsx') return ts.ScriptKind.TSX;
  if (extension === '.jsx') return ts.ScriptKind.JSX;
  if (extension === '.ts') return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
};

const containsForbiddenTerm = (value) => forbiddenTerms.some((term) => value.includes(term));
const isLikelySql = (value) => /\b(SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|GROUP\s+BY|ORDER\s+BY)\b/i.test(value);

const checkFile = (filePath) => {
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    sourceKindFor(filePath)
  );
  const findings = [];

  const collect = (node, value) => {
    if (!value || allowedInternalValues.has(value) || isLikelySql(value) || !containsForbiddenTerm(value)) return;
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    findings.push({
      filePath,
      line: start.line + 1,
      value: value.replace(/\s+/g, ' ').trim(),
    });
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      collect(node, node.getText(sourceFile));
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      collect(node, node.text);
    } else if (ts.isTemplateExpression(node)) {
      collect(node.head, node.head.text);
      node.templateSpans.forEach((span) => collect(span.literal, span.literal.text));
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return findings;
};

const findings = scanRoots
  .flatMap(filesIn)
  .flatMap(checkFile)
  .sort((a, b) => a.filePath.localeCompare(b.filePath) || a.line - b.line);

if (findings.length > 0) {
  console.error('Terminology audit failed: found non-standard user-facing terms.');
  findings.forEach(({ filePath, line, value }) => {
    console.error(`- ${path.relative(projectRoot, filePath)}:${line} — ${value}`);
  });
  process.exitCode = 1;
} else {
  console.log('Terminology audit passed: no forbidden user-facing terms found.');
}
