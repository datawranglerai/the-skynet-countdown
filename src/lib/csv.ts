export type CsvRecord = Record<string, string>;

export function parseCsv(input: string): CsvRecord[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  if (text.length === 0) return [];

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let justClosedQuote = false;

  const finishField = () => {
    row.push(field);
    field = '';
    justClosedQuote = false;
  };
  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
          justClosedQuote = true;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (justClosedQuote && character !== ',' && character !== '\r' && character !== '\n') {
      throw new Error(`Malformed CSV: unexpected character after closing quote at offset ${index}`);
    }
    if (character === '"') {
      if (field.length !== 0) {
        throw new Error(`Malformed CSV: quote inside an unquoted field at offset ${index}`);
      }
      quoted = true;
    } else if (character === ',') {
      finishField();
    } else if (character === '\n') {
      finishRow();
    } else if (character === '\r') {
      if (text[index + 1] === '\n') index += 1;
      finishRow();
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('Malformed CSV: unclosed quoted field');
  if (field.length > 0 || row.length > 0 || !text.endsWith('\n') && !text.endsWith('\r')) finishRow();
  if (rows.length === 0) return [];

  const headers = rows[0];
  if (headers.some((header) => header.length === 0)) throw new Error('Malformed CSV: header names cannot be blank');
  if (new Set(headers).size !== headers.length) throw new Error('Malformed CSV: duplicate header name');

  return rows.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length) {
      throw new Error(
        `Malformed CSV: data row ${rowIndex + 1} has ${values.length} fields; expected ${headers.length}`,
      );
    }
    return Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex]]));
  });
}

export function cleanMachineCitations(value: string): string {
  return value
    .replace(/\s*cite(?:[^]+)+/gu, '')
    .replace(/\s*【[^】]*(?:turn\d+(?:search|view|fetch|open)\d+)[^】]*】/giu, '')
    .replace(/[ \t]+([,.;:!?])/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export function stableContentFingerprint(parts: readonly (string | number | boolean)[]): string {
  const value = parts.map((part) => String(part).normalize('NFC').trim()).join('\u241f');
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}
