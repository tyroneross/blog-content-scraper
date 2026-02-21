/**
 * Python File Parser
 *
 * Parses Python source files (.py) to extract structured information:
 * - Module-level docstrings
 * - Imports
 * - Functions and their signatures, docstrings, decorators
 * - Classes and their methods, attributes, docstrings
 * - Top-level constants and variables
 * - Comments
 *
 * This is a static analysis parser (no Python runtime required).
 * Uses regex-based parsing for portability and speed.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface PythonParseResult {
  /** Original file path or name */
  fileName: string;
  /** Module-level docstring */
  moduleDocstring?: string;
  /** Import statements */
  imports: PythonImport[];
  /** Top-level functions */
  functions: PythonFunction[];
  /** Top-level classes */
  classes: PythonClass[];
  /** Top-level constants/variables */
  variables: PythonVariable[];
  /** Standalone comments */
  comments: string[];
  /** Total lines of code (excluding blanks and comments) */
  linesOfCode: number;
  /** Total lines including blanks and comments */
  totalLines: number;
  /** Blank lines count */
  blankLines: number;
  /** Comment lines count */
  commentLines: number;
  /** Markdown representation of the module */
  markdown: string;
  /** Plain text summary */
  text: string;
  /** Word count */
  wordCount: number;
  /** Estimated token count */
  estimatedTokens: number;
  /** Parse time in milliseconds */
  parseTime: number;
  /** Any parse errors */
  errors?: string[];
}

export interface PythonImport {
  /** 'import' or 'from' */
  type: 'import' | 'from';
  /** Module name */
  module: string;
  /** Imported names (for 'from X import Y') */
  names?: string[];
  /** Alias (for 'import X as Y') */
  alias?: string;
  /** Line number */
  line: number;
}

export interface PythonFunction {
  /** Function name */
  name: string;
  /** Function parameters */
  parameters: PythonParameter[];
  /** Return type annotation */
  returnType?: string;
  /** Docstring */
  docstring?: string;
  /** Decorators */
  decorators: string[];
  /** Is async function */
  isAsync: boolean;
  /** Is generator (contains yield) */
  isGenerator: boolean;
  /** Line number of definition */
  line: number;
  /** End line number */
  endLine: number;
  /** Full source code */
  source: string;
}

export interface PythonClass {
  /** Class name */
  name: string;
  /** Base classes */
  bases: string[];
  /** Class docstring */
  docstring?: string;
  /** Decorators */
  decorators: string[];
  /** Class methods */
  methods: PythonFunction[];
  /** Class attributes */
  attributes: PythonVariable[];
  /** Line number */
  line: number;
  /** End line number */
  endLine: number;
  /** Full source code */
  source: string;
}

export interface PythonParameter {
  /** Parameter name */
  name: string;
  /** Type annotation */
  type?: string;
  /** Default value */
  default?: string;
  /** Is *args */
  isArgs: boolean;
  /** Is **kwargs */
  isKwargs: boolean;
}

export interface PythonVariable {
  /** Variable name */
  name: string;
  /** Type annotation */
  type?: string;
  /** Assigned value (truncated) */
  value?: string;
  /** Line number */
  line: number;
}

export interface PythonParseOptions {
  /** Include full source code in function/class results (default: true) */
  includeSource?: boolean;
  /** Maximum length for variable values (default: 100) */
  maxValueLength?: number;
  /** Parse nested classes/functions (default: true) */
  parseNested?: boolean;
}

/**
 * Parse a Python file from disk.
 *
 * @param filePath - Path to the .py file
 * @param options - Parse options
 * @returns Parsed Python module structure
 *
 * @example
 * ```typescript
 * import { parsePythonFile } from '@tyroneross/omniscraper/parsers';
 *
 * const result = parsePythonFile('./scripts/process.py');
 * console.log(result.functions.map(f => f.name));
 * console.log(result.classes.map(c => c.name));
 * console.log(result.markdown);
 * ```
 */
export function parsePythonFile(
  filePath: string,
  options: PythonParseOptions = {}
): PythonParseResult {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = path.basename(filePath);

  return parsePythonSource(content, fileName, options);
}

/**
 * Parse Python source code from a string.
 *
 * @param source - Python source code
 * @param fileName - Optional file name for reference
 * @param options - Parse options
 * @returns Parsed Python module structure
 *
 * @example
 * ```typescript
 * const source = `
 * def hello(name: str) -> str:
 *     """Greet someone."""
 *     return f"Hello, {name}!"
 * `;
 *
 * const result = parsePythonSource(source);
 * console.log(result.functions[0].name); // "hello"
 * ```
 */
export function parsePythonSource(
  source: string,
  fileName: string = '<string>',
  options: PythonParseOptions = {}
): PythonParseResult {
  const startTime = Date.now();
  const {
    includeSource = true,
    maxValueLength = 100,
  } = options;

  const lines = source.split('\n');
  const errors: string[] = [];

  // Line statistics
  const totalLines = lines.length;
  let blankLines = 0;
  let commentLines = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') blankLines++;
    else if (trimmed.startsWith('#')) commentLines++;
  }

  const linesOfCode = totalLines - blankLines - commentLines;

  // Parse components
  const moduleDocstring = extractModuleDocstring(source);
  const imports = extractImports(lines);
  const functions = extractFunctions(source, lines, includeSource);
  const classes = extractClasses(source, lines, includeSource);
  const variables = extractVariables(lines, maxValueLength);
  const comments = extractStandaloneComments(lines);

  // Generate markdown
  const markdown = generateMarkdown(fileName, moduleDocstring, imports, functions, classes, variables);
  const text = generatePlainText(fileName, moduleDocstring, imports, functions, classes, variables);
  const wordCount = countWords(text);
  const estimatedTokens = Math.ceil(source.length / 4);

  return {
    fileName,
    moduleDocstring,
    imports,
    functions,
    classes,
    variables,
    comments,
    linesOfCode,
    totalLines,
    blankLines,
    commentLines,
    markdown,
    text,
    wordCount,
    estimatedTokens,
    parseTime: Date.now() - startTime,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// --- Extraction helpers ---

function extractModuleDocstring(source: string): string | undefined {
  // Module docstring must be at the very start (after optional comments/encoding)
  const match = source.match(/^(?:\s*#[^\n]*\n)*\s*("""[\s\S]*?"""|'''[\s\S]*?''')/);
  if (match) {
    return cleanDocstring(match[1]);
  }
  return undefined;
}

function extractImports(lines: string[]): PythonImport[] {
  const imports: PythonImport[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // from X import Y, Z
    const fromMatch = line.match(/^from\s+([\w.]+)\s+import\s+(.+)$/);
    if (fromMatch) {
      const names = fromMatch[2]
        .split(',')
        .map(n => n.trim())
        .filter(n => n && n !== '(');

      // Handle multi-line imports
      if (line.includes('(') && !line.includes(')')) {
        let j = i + 1;
        while (j < lines.length && !lines[j].includes(')')) {
          const cont = lines[j].trim().replace(/[(),]/g, '').trim();
          if (cont) {
            cont.split(',').forEach(n => {
              const trimmed = n.trim();
              if (trimmed) names.push(trimmed);
            });
          }
          j++;
        }
        // Last line with closing paren
        if (j < lines.length) {
          const cont = lines[j].trim().replace(/[(),]/g, '').trim();
          if (cont) {
            cont.split(',').forEach(n => {
              const trimmed = n.trim();
              if (trimmed) names.push(trimmed);
            });
          }
        }
      }

      imports.push({
        type: 'from',
        module: fromMatch[1],
        names: names.filter(n => n.length > 0),
        line: i + 1,
      });
      continue;
    }

    // import X, import X as Y
    const importMatch = line.match(/^import\s+([\w.]+)(?:\s+as\s+(\w+))?$/);
    if (importMatch) {
      imports.push({
        type: 'import',
        module: importMatch[1],
        alias: importMatch[2] || undefined,
        line: i + 1,
      });
    }
  }

  return imports;
}

function extractFunctions(
  source: string,
  lines: string[],
  includeSource: boolean
): PythonFunction[] {
  const functions: PythonFunction[] = [];

  // Find lines that are inside `if __name__` blocks (treat as top-level)
  const mainBlockIndent = findMainBlockIndent(lines);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match top-level function definitions (no indentation)
    // Also match functions at exactly one indent level inside `if __name__` blocks
    const indent = getIndentLevel(line);
    const isTopLevel = indent === 0;
    const isInMainBlock = mainBlockIndent !== null && indent === mainBlockIndent && isInsideMainBlock(lines, i, mainBlockIndent);

    if (!isTopLevel && !isInMainBlock) continue;

    const defMatch = line.match(/^\s*(async\s+)?def\s+(\w+)\s*\(/);
    if (!defMatch) continue;

    const isAsync = !!defMatch[1];
    const name = defMatch[2];
    const lineNumber = i + 1;

    // Collect full signature (may span multiple lines)
    let sigLines = line;
    let j = i;
    let parenDepth = 0;
    for (const ch of line) {
      if (ch === '(') parenDepth++;
      if (ch === ')') parenDepth--;
    }
    while (parenDepth > 0 && j + 1 < lines.length) {
      j++;
      sigLines += '\n' + lines[j];
      for (const ch of lines[j]) {
        if (ch === '(') parenDepth++;
        if (ch === ')') parenDepth--;
      }
    }

    // Parse parameters from the full signature
    const sigMatch = sigLines.match(/def\s+\w+\s*\(([\s\S]*?)\)\s*(?:->\s*([^:]+))?\s*:/);
    const paramsStr = sigMatch ? sigMatch[1].replace(/\n/g, ' ') : '';
    const returnType = sigMatch?.[2]?.trim();

    const parameters = parseParameters(paramsStr);

    // Collect decorators from lines above
    const decorators: string[] = [];
    let k = i - 1;
    while (k >= 0 && lines[k].trim().startsWith('@')) {
      decorators.unshift(lines[k].trim());
      k--;
    }

    // Find end of function
    const endLine = findBlockEnd(lines, i);
    const funcSource = includeSource
      ? lines.slice(i, endLine).join('\n')
      : '';

    // Extract docstring
    const bodyStart = j + 1; // line after the signature ends
    const docstring = extractBlockDocstring(lines, bodyStart);

    // Check for yield
    const isGenerator = funcSource.includes('yield ') || funcSource.includes('yield\n');

    functions.push({
      name,
      parameters,
      returnType,
      docstring,
      decorators,
      isAsync,
      isGenerator,
      line: lineNumber,
      endLine,
      source: funcSource,
    });
  }

  return functions;
}

/**
 * Find the indent level used inside `if __name__ == "__main__":` blocks.
 * Returns null if no such block exists.
 */
function findMainBlockIndent(lines: string[]): number | null {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].match(/^if\s+__name__\s*==\s*['"]__main__['"]\s*:/)) {
      // Find the indent of the first non-blank line inside the block
      for (let j = i + 1; j < lines.length; j++) {
        const trimmed = lines[j].trim();
        if (trimmed === '') continue;
        const indent = getIndentLevel(lines[j]);
        if (indent > 0) return indent;
        break;
      }
    }
  }
  return null;
}

/**
 * Check if a line at a given index is inside an `if __name__` block.
 */
function isInsideMainBlock(lines: string[], lineIndex: number, expectedIndent: number): boolean {
  // Walk backward to find the enclosing `if __name__` statement
  for (let i = lineIndex - 1; i >= 0; i--) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '') continue;

    const indent = getIndentLevel(line);

    // If we find a line at indent 0 that's the __name__ guard, we're inside it
    if (indent === 0 && trimmed.match(/^if\s+__name__\s*==\s*['"]__main__['"]\s*:/)) {
      return true;
    }

    // If we find any other line at indent 0 that's not blank/comment, we're not in a __name__ block
    if (indent === 0 && !trimmed.startsWith('#')) {
      return false;
    }
  }
  return false;
}

function extractClasses(
  source: string,
  lines: string[],
  includeSource: boolean
): PythonClass[] {
  const classes: PythonClass[] = [];
  const classPattern = /^((?:@\w[\w.]*(?:\([^)]*\))?\s*\n)*)(class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:)/gm;

  let match: RegExpExecArray | null;
  while ((match = classPattern.exec(source)) !== null) {
    const decoratorsBlock = match[1] || '';
    const name = match[3];
    const basesStr = match[4] || '';

    const lineNumber = source.substring(0, match.index).split('\n').length;
    const decorators = extractDecorators(decoratorsBlock);
    const bases = basesStr
      .split(',')
      .map(b => b.trim())
      .filter(b => b.length > 0);

    // Find end of class
    const endLine = findBlockEnd(lines, lineNumber - 1);
    const classSource = includeSource
      ? lines.slice(lineNumber - 1, endLine).join('\n')
      : '';

    // Extract docstring
    const docstring = extractBlockDocstring(lines, lineNumber);

    // Extract methods (indented def statements within class)
    const methods = extractClassMethods(lines, lineNumber - 1, endLine, includeSource);

    // Extract class-level attributes
    const attributes = extractClassAttributes(lines, lineNumber - 1, endLine);

    classes.push({
      name,
      bases,
      docstring,
      decorators,
      methods,
      attributes,
      line: lineNumber,
      endLine,
      source: classSource,
    });
  }

  return classes;
}

function extractClassMethods(
  lines: string[],
  classStartLine: number,
  classEndLine: number,
  includeSource: boolean
): PythonFunction[] {
  const methods: PythonFunction[] = [];
  const classBody = lines.slice(classStartLine + 1, classEndLine);

  for (let i = 0; i < classBody.length; i++) {
    const line = classBody[i];

    // Match method definition start (may not have closing paren on same line)
    const methodMatch = line.match(/^(\s+)(async\s+)?def\s+(\w+)\s*\(/);
    if (!methodMatch) continue;

    const isAsync = !!methodMatch[2];
    const name = methodMatch[3];
    const absoluteLine = classStartLine + 1 + i + 1;

    // Collect full signature (may span multiple lines)
    let sigLines = line;
    let sigEnd = i;
    let parenDepth = 0;
    for (const ch of line) {
      if (ch === '(') parenDepth++;
      if (ch === ')') parenDepth--;
    }
    while (parenDepth > 0 && sigEnd + 1 < classBody.length) {
      sigEnd++;
      sigLines += '\n' + classBody[sigEnd];
      for (const ch of classBody[sigEnd]) {
        if (ch === '(') parenDepth++;
        if (ch === ')') parenDepth--;
      }
    }

    // Parse parameters from the full signature
    const sigMatch = sigLines.match(/def\s+\w+\s*\(([\s\S]*?)\)\s*(?:->\s*([^:]+))?\s*:/);
    const paramsStr = sigMatch ? sigMatch[1].replace(/\n/g, ' ') : '';
    const returnType = sigMatch?.[2]?.trim();

    const parameters = parseParameters(paramsStr);

    // Find decorators above this method
    const decorators: string[] = [];
    let j = i - 1;
    while (j >= 0 && classBody[j].trim().startsWith('@')) {
      decorators.unshift(classBody[j].trim());
      j--;
    }

    // Find end of method
    const methodEndLine = findBlockEnd(lines, absoluteLine - 1);
    const methodSource = includeSource
      ? lines.slice(absoluteLine - 1, methodEndLine).join('\n')
      : '';

    // Extract docstring (after the signature ends)
    const bodyStartLine = classStartLine + 1 + sigEnd + 1 + 1;
    const docstring = extractBlockDocstring(lines, bodyStartLine);

    const isGenerator = methodSource.includes('yield ') || methodSource.includes('yield\n');

    methods.push({
      name,
      parameters,
      returnType,
      docstring,
      decorators,
      isAsync,
      isGenerator,
      line: absoluteLine,
      endLine: methodEndLine,
      source: methodSource,
    });
  }

  return methods;
}

function extractClassAttributes(
  lines: string[],
  classStartLine: number,
  classEndLine: number
): PythonVariable[] {
  const attrs: PythonVariable[] = [];
  const classBody = lines.slice(classStartLine + 1, classEndLine);

  for (let i = 0; i < classBody.length; i++) {
    const line = classBody[i];
    // Class-level attribute assignment (not inside a method)
    const attrMatch = line.match(/^\s{4}(\w+)\s*(?::\s*([^=]+?))?\s*=\s*(.+)$/);
    if (!attrMatch) continue;

    // Make sure we're not inside a method
    const prevNonBlank = findPreviousNonBlank(classBody, i);
    if (prevNonBlank >= 0 && classBody[prevNonBlank].match(/^\s{4,}(def|async\s+def|if|for|while|with|try)/)) {
      continue;
    }

    attrs.push({
      name: attrMatch[1],
      type: attrMatch[2]?.trim() || undefined,
      value: attrMatch[3].trim().substring(0, 100),
      line: classStartLine + 1 + i + 1,
    });
  }

  return attrs;
}

function extractVariables(lines: string[], maxValueLength: number): PythonVariable[] {
  const variables: PythonVariable[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Only top-level (no indentation), skip function/class defs
    if (line.startsWith(' ') || line.startsWith('\t')) continue;
    if (line.trim().startsWith('#') || line.trim() === '') continue;
    if (line.match(/^(def |async def |class |import |from |@|if |for |while |with |try |except |finally )/)) continue;

    // Match assignments: name = value or name: type = value
    // Captures SCREAMING_CASE, snake_case, PascalCase, and camelCase identifiers
    const varMatch = line.match(/^([a-zA-Z_]\w*)\s*(?::\s*([^=]+?))?\s*=\s*(.+)$/);
    if (varMatch) {
      // Skip dunder variables like __all__ and __version__ that are metadata
      const vname = varMatch[1];
      if (vname.startsWith('__') && vname.endsWith('__')) continue;

      variables.push({
        name: vname,
        type: varMatch[2]?.trim() || undefined,
        value: varMatch[3].trim().substring(0, maxValueLength),
        line: i + 1,
      });
    }
  }

  return variables;
}

function extractStandaloneComments(lines: string[]): string[] {
  const comments: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') && !trimmed.startsWith('#!')) {
      comments.push(trimmed.substring(1).trim());
    }
  }

  return comments;
}

function extractDecorators(block: string): string[] {
  if (!block) return [];
  return block
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('@'));
}

function parseParameters(paramsStr: string): PythonParameter[] {
  if (!paramsStr.trim()) return [];

  const params: PythonParameter[] = [];
  // Simple parameter splitting (handles basic cases)
  const parts = splitParameters(paramsStr);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    const isArgs = trimmed.startsWith('*') && !trimmed.startsWith('**');
    const isKwargs = trimmed.startsWith('**');
    const cleanParam = trimmed.replace(/^\*{1,2}/, '');

    // Parse name: type = default
    const paramMatch = cleanParam.match(/^(\w+)\s*(?::\s*([^=]+?))?\s*(?:=\s*(.+))?$/);
    if (paramMatch) {
      params.push({
        name: paramMatch[1],
        type: paramMatch[2]?.trim() || undefined,
        default: paramMatch[3]?.trim() || undefined,
        isArgs,
        isKwargs,
      });
    }
  }

  return params;
}

function splitParameters(paramsStr: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;

  for (const char of paramsStr) {
    if (char === '(' || char === '[' || char === '{') depth++;
    else if (char === ')' || char === ']' || char === '}') depth--;
    else if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);

  return parts;
}

function findBlockEnd(lines: string[], startLine: number): number {
  if (startLine >= lines.length) return startLine;

  // Find the indentation of the block header
  const headerIndent = getIndentLevel(lines[startLine]);
  let endLine = startLine + 1;

  while (endLine < lines.length) {
    const line = lines[endLine];
    const trimmed = line.trim();

    // Skip blank lines
    if (trimmed === '') {
      endLine++;
      continue;
    }

    const currentIndent = getIndentLevel(line);

    // If we find a line at the same or lower indent level, block is done
    if (currentIndent <= headerIndent) {
      break;
    }

    endLine++;
  }

  return endLine;
}

function getIndentLevel(line: string): number {
  const match = line.match(/^(\s*)/);
  return match ? match[1].length : 0;
}

function findPreviousNonBlank(lines: string[], index: number): number {
  for (let i = index - 1; i >= 0; i--) {
    if (lines[i].trim() !== '') return i;
  }
  return -1;
}

function extractBlockDocstring(lines: string[], defLine: number): string | undefined {
  // docstring is on the line after the def/class line
  const nextLine = defLine; // 0-indexed
  if (nextLine >= lines.length) return undefined;

  const line = lines[nextLine].trim();

  // Single-line docstring
  if (line.match(/^("""|''').*\1$/)) {
    return cleanDocstring(line);
  }

  // Multi-line docstring
  if (line.startsWith('"""') || line.startsWith("'''")) {
    const quote = line.substring(0, 3);
    const docLines = [line];
    let i = nextLine + 1;
    while (i < lines.length) {
      docLines.push(lines[i]);
      if (lines[i].trim().endsWith(quote)) break;
      i++;
    }
    return cleanDocstring(docLines.join('\n'));
  }

  return undefined;
}

function cleanDocstring(raw: string): string {
  return raw
    .replace(/^("""|''')\s*/, '')
    .replace(/\s*("""|''')$/, '')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .trim();
}

// --- Output generation ---

function generateMarkdown(
  fileName: string,
  moduleDocstring: string | undefined,
  imports: PythonImport[],
  functions: PythonFunction[],
  classes: PythonClass[],
  variables: PythonVariable[]
): string {
  const sections: string[] = [];

  sections.push(`# ${fileName}`);

  if (moduleDocstring) {
    sections.push(`\n${moduleDocstring}`);
  }

  if (imports.length > 0) {
    sections.push('\n## Imports\n');
    for (const imp of imports) {
      if (imp.type === 'from') {
        sections.push(`- \`from ${imp.module} import ${imp.names?.join(', ')}\``);
      } else {
        sections.push(`- \`import ${imp.module}${imp.alias ? ` as ${imp.alias}` : ''}\``);
      }
    }
  }

  if (variables.length > 0) {
    sections.push('\n## Constants\n');
    for (const v of variables) {
      sections.push(`- **${v.name}**${v.type ? `: ${v.type}` : ''} = \`${v.value}\``);
    }
  }

  if (functions.length > 0) {
    sections.push('\n## Functions\n');
    for (const func of functions) {
      const params = func.parameters.map(p => {
        let s = p.isArgs ? '*' : p.isKwargs ? '**' : '';
        s += p.name;
        if (p.type) s += `: ${p.type}`;
        if (p.default) s += ` = ${p.default}`;
        return s;
      }).join(', ');

      const sig = `${func.isAsync ? 'async ' : ''}def ${func.name}(${params})${func.returnType ? ` -> ${func.returnType}` : ''}`;
      sections.push(`### \`${sig}\``);
      if (func.decorators.length > 0) {
        sections.push(`Decorators: ${func.decorators.join(', ')}`);
      }
      if (func.docstring) {
        sections.push(`\n${func.docstring}`);
      }
      sections.push('');
    }
  }

  if (classes.length > 0) {
    sections.push('\n## Classes\n');
    for (const cls of classes) {
      const bases = cls.bases.length > 0 ? `(${cls.bases.join(', ')})` : '';
      sections.push(`### class ${cls.name}${bases}`);
      if (cls.decorators.length > 0) {
        sections.push(`Decorators: ${cls.decorators.join(', ')}`);
      }
      if (cls.docstring) {
        sections.push(`\n${cls.docstring}`);
      }
      if (cls.attributes.length > 0) {
        sections.push('\n**Attributes:**');
        for (const attr of cls.attributes) {
          sections.push(`- \`${attr.name}${attr.type ? ': ' + attr.type : ''}\` = \`${attr.value}\``);
        }
      }
      if (cls.methods.length > 0) {
        sections.push('\n**Methods:**');
        for (const method of cls.methods) {
          const params = method.parameters
            .filter(p => p.name !== 'self' && p.name !== 'cls')
            .map(p => {
              let s = p.isArgs ? '*' : p.isKwargs ? '**' : '';
              s += p.name;
              if (p.type) s += `: ${p.type}`;
              return s;
            }).join(', ');

          sections.push(`- \`${method.isAsync ? 'async ' : ''}${method.name}(${params})${method.returnType ? ' -> ' + method.returnType : ''}\`${method.docstring ? ' - ' + method.docstring.split('\n')[0] : ''}`);
        }
      }
      sections.push('');
    }
  }

  return sections.join('\n');
}

function generatePlainText(
  fileName: string,
  moduleDocstring: string | undefined,
  imports: PythonImport[],
  functions: PythonFunction[],
  classes: PythonClass[],
  variables: PythonVariable[]
): string {
  const parts: string[] = [];

  parts.push(`Module: ${fileName}`);
  if (moduleDocstring) parts.push(moduleDocstring);

  if (imports.length > 0) {
    parts.push(`\nImports: ${imports.map(i => i.module).join(', ')}`);
  }

  if (variables.length > 0) {
    parts.push(`\nConstants: ${variables.map(v => v.name).join(', ')}`);
  }

  if (functions.length > 0) {
    parts.push(`\nFunctions: ${functions.map(f => f.name).join(', ')}`);
    for (const func of functions) {
      if (func.docstring) parts.push(`  ${func.name}: ${func.docstring.split('\n')[0]}`);
    }
  }

  if (classes.length > 0) {
    parts.push(`\nClasses: ${classes.map(c => c.name).join(', ')}`);
    for (const cls of classes) {
      if (cls.docstring) parts.push(`  ${cls.name}: ${cls.docstring.split('\n')[0]}`);
      if (cls.methods.length > 0) {
        parts.push(`    Methods: ${cls.methods.map(m => m.name).join(', ')}`);
      }
    }
  }

  return parts.join('\n');
}

function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}
