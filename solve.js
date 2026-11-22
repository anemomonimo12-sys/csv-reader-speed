// A fast CSV reader with csv-reader 1.0.0's exact reading: run(input) answers {columns, rows, errors} for
// {text, header}, byte for byte the reference's answer on every input, by the same broken-row policy:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled, "" inside it one quote, and
//     each CRLF or lone CR inside it read as LF; what follows its closing quote, up to the next comma or line
//     break, is appended as it stands (quote_junk, when the field ends); a quote that never closes is a literal
//     character, and the text after it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds the records after it (every record
//     when header is false), each padded with "" (short_row, with fields: its count) or cut (long_row, with
//     extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}: line the 1-based line its record starts on (every LF, CRLF and lone CR
//     inside a quoted field counted), row its record's index in rows (null for the header), in the order met.
//
// Where the reference builds each field a character at a time, this reader takes each field as one slice of the
// text wherever it can: an unquoted field is scanned for its terminator and sliced once, a quoted field is
// scanned quote to quote with indexOf and its literal runs sliced whole, and only the rare broken shapes (a
// stray CR inside a field, a CR inside quotes, junk after a closing quote) fall back to assembling pieces.
// Pure: no clock, no randomness, no locale, nothing kept from one call to the next.

/** How a field ended: at a comma (the record goes on), at a line break or at the end of the text (it ends). */
const COMMA_END = 0;
const BREAK_END = 1;
const EOF_END = 2;

/** csv-reader's answer for one case's input {text, header}: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xFEFF) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read: its value, how it ended, and (for an unquoted read) how many characters it kept.
  let fValue = '';
  let fEnded = EOF_END;
  let fAdded = 0;

  // Reads unquoted characters onto `value` up to the next comma or line break: a CR not followed by LF is
  // dropped (stray_cr). Sets fValue, fEnded and fAdded.
  function readUnquoted(value) {
    let parts = null; // kept pieces, once a stray CR splits the field
    let added = 0;
    let seg = pos; // the start of the piece not yet taken
    let end = n; // where the field's last piece stops: the terminator, or the end of the text
    let ended = EOF_END;
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 44 || c === 10) { // , or LF
        end = pos;
        ended = c === 44 ? COMMA_END : BREAK_END;
        break;
      }
      if (c === 13) { // CR
        if (text.charCodeAt(pos + 1) === 10) { // CRLF ends the field
          end = pos;
          ended = BREAK_END;
          break;
        }
        if (parts === null) {
          parts = [];
          if (value !== '') parts.push(value);
        }
        if (pos > seg) {
          parts.push(text.slice(seg, pos));
          added += pos - seg;
        }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        pos += 1;
        seg = pos;
        continue;
      }
      pos += 1;
    }
    if (parts !== null) {
      if (end > seg) {
        parts.push(text.slice(seg, end));
        added += end - seg;
      }
      fValue = parts.join('');
    } else if (end > seg) {
      fValue = value === '' ? text.slice(seg, end) : value + text.slice(seg, end);
      added = end - seg;
    } else {
      fValue = value;
    }
    fAdded = added;
    fEnded = ended;
    if (ended === COMMA_END) {
      pos = end + 1;
    } else if (ended === BREAK_END) {
      pos = end + (text.charCodeAt(end) === 13 ? 2 : 1);
      line += 1;
    } else {
      pos = end;
    }
  }

  // The pieces of the quoted field being read: one string until a second piece is needed, then a list.
  let aParts = null;
  let aValue = '';

  function piece(s) {
    if (s === '') return;
    if (aParts !== null) aParts.push(s);
    else if (aValue === '') aValue = s;
    else {
      aParts = [aValue, s];
      aValue = '';
    }
  }

  // Reads a quoted field whose opening quote is at pos. Sets fValue and fEnded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    aParts = null;
    aValue = '';
    let seg = pos; // the start of the literal run not yet taken
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        readUnquoted('"');
        return;
      }
      if (q > seg) {
        const runText = text.slice(seg, q);
        if (runText.indexOf('\r') === -1) {
          // No CR: the run stands as it is; count its LFs.
          let i = runText.indexOf('\n');
          while (i !== -1) {
            line += 1;
            i = runText.indexOf('\n', i + 1);
          }
          piece(runText);
        } else {
          // CRLF and a lone CR inside quotes are each read as LF.
          let out = '';
          let i = 0;
          const m = runText.length;
          let chunk = 0; // the start of the plain run not yet taken
          while (i < m) {
            const ch = runText.charCodeAt(i);
            if (ch === 13) {
              if (i > chunk) out += runText.slice(chunk, i);
              out += '\n';
              line += 1;
              i += runText.charCodeAt(i + 1) === 10 ? 2 : 1;
              chunk = i;
            } else {
              if (ch === 10) line += 1;
              i += 1;
            }
          }
          if (m > chunk) out += runText.slice(chunk, m);
          piece(out);
        }
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote is one literal quote.
        piece('"');
        pos = q + 2;
        seg = pos;
        continue;
      }
      // The closing quote.
      pos = q + 1;
      fValue = aParts !== null ? aParts.join('') : aValue;
      if (pos >= n) {
        fEnded = EOF_END;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fEnded = COMMA_END;
        return;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fEnded = BREAK_END;
        return;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fEnded = BREAK_END;
        return;
      }
      // What follows the closing quote is appended as it stands, up to the next comma or line break.
      readUnquoted(fValue);
      if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      return;
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted = false;
    do {
      quoted = text.charCodeAt(pos) === 34;
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fValue);
    } while (fEnded === COMMA_END);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
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
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
