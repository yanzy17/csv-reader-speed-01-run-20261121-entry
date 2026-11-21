const COMMA = 44;
const QUOTE = 34;
const LF = 10;
const CR = 13;
const END = 0;
const LINE_BREAK = 1;
const FIELD_BREAK = 2;

export function run(input) {
  const text = String(input.text);
  const length = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;
  let columns = null;
  let width = -1;
  const rows = [];
  const errors = [];
  const fieldResult = { value: '', added: 0, ended: END };

  function addError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  function quotedResult(value, ended) {
    fieldResult.value = value;
    fieldResult.added = 0;
    fieldResult.ended = ended;
    return fieldResult;
  }

  function readUnquoted(prefix = '') {
    const start = pos;
    let segmentStart = pos;
    let pieces = null;
    let dropped = 0;

    while (pos < length) {
      const code = text.charCodeAt(pos);
      if (code === COMMA || code === LF || (code === CR && text.charCodeAt(pos + 1) === LF)) break;
      if (code === CR) {
        if (pieces === null) pieces = [];
        if (pos > segmentStart) pieces.push(text.slice(segmentStart, pos));
        dropped++;
        addError('stray_cr');
        pos++;
        segmentStart = pos;
      } else {
        pos++;
      }
    }

    let value;
    if (pieces === null) {
      value = prefix + text.slice(start, pos);
    } else {
      if (pos > segmentStart) pieces.push(text.slice(segmentStart, pos));
      value = prefix + pieces.join('');
    }
    const added = pos - start - dropped;

    let ended = END;
    if (pos < length) {
      const code = text.charCodeAt(pos);
      if (code === COMMA) {
        pos++;
        ended = FIELD_BREAK;
      } else if (code === LF) {
        pos++;
        line++;
        ended = LINE_BREAK;
      } else {
        pos += 2;
        line++;
        ended = LINE_BREAK;
      }
    }
    fieldResult.value = value;
    fieldResult.added = added;
    fieldResult.ended = ended;
    return fieldResult;
  }

  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos++;
    let segmentStart = pos;
    let pieces = null;
    let closed = false;

    while (pos < length) {
      const code = text.charCodeAt(pos);
      if (code === QUOTE) {
        if (pos > segmentStart) {
          if (pieces === null) pieces = [];
          pieces.push(text.slice(segmentStart, pos));
        }
        if (text.charCodeAt(pos + 1) === QUOTE) {
          if (pieces === null) pieces = [];
          pieces.push('"');
          pos += 2;
          segmentStart = pos;
        } else {
          pos++;
          closed = true;
          break;
        }
      } else if (code === CR) {
        if (pieces === null) pieces = [];
        if (pos > segmentStart) pieces.push(text.slice(segmentStart, pos));
        pieces.push('\n');
        line++;
        pos += text.charCodeAt(pos + 1) === LF ? 2 : 1;
        segmentStart = pos;
      } else {
        if (code === LF) line++;
        pos++;
      }
    }

    if (!closed) {
      pos = open + 1;
      line = openLine;
      addError('unterminated_quote');
      return readUnquoted('"');
    }

    const value = pieces === null ? text.slice(open + 1, pos - 1) : pieces.join('');
    if (pos >= length) return quotedResult(value, END);

    const code = text.charCodeAt(pos);
    if (code === COMMA) {
      pos++;
      return quotedResult(value, FIELD_BREAK);
    }
    if (code === LF) {
      pos++;
      line++;
      return quotedResult(value, LINE_BREAK);
    }
    if (code === CR && text.charCodeAt(pos + 1) === LF) {
      pos += 2;
      line++;
      return quotedResult(value, LINE_BREAK);
    }

    const junk = readUnquoted(value);
    if (junk.added > 0) addError('quote_junk');
    return junk;
  }

  while (true) {
    while (pos < length) {
      const code = text.charCodeAt(pos);
      if (code === LF) {
        pos++;
        line++;
      } else if (code === CR && text.charCodeAt(pos + 1) === LF) {
        pos += 2;
        line++;
      } else {
        break;
      }
    }
    if (pos >= length) break;

    recordLine = line;
    recordRow = input.header === true && columns === null ? null : rows.length;
    const fields = [];
    let quoted;
    let field;
    do {
      quoted = text.charCodeAt(pos) === QUOTE;
      field = quoted ? readQuoted() : readUnquoted();
      fields.push(field.value);
    } while (field.ended === FIELD_BREAK);

    if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    if (width < 0) width = fields.length;

    if (input.header === true && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  return { columns: input.header === true ? (columns ?? []) : null, rows, errors };
}
