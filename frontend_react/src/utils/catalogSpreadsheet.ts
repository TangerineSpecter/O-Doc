import JSZip from 'jszip';

export interface CatalogExportSheet {
    name: string;
    rows: readonly unknown[];
}

const IMAGE_FIELD_PREFIXES = ['icon', 'image', 'img', 'sprite', 'portrait'];

function isImageField(field: string): boolean {
    const normalized = field.replace(/[_-]/g, '').toLowerCase();
    return IMAGE_FIELD_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

function stripImageFields(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stripImageFields);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).filter(([field]) => !isImageField(field))
        .map(([field, child]) => [field, stripImageFields(child)]));
}

function flattenRecord(value: unknown, prefix = '', result: Record<string, unknown> = {}): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;

    for (const [field, child] of Object.entries(value)) {
        if (isImageField(field)) continue;
        const key = prefix ? `${prefix}.${field}` : field;
        if (child && typeof child === 'object' && !Array.isArray(child)) {
            flattenRecord(child, key, result);
        } else {
            result[key] = stripImageFields(child);
        }
    }
    return result;
}

function xmlEscape(value: string): string {
    const safe = Array.from(value).filter(character => {
        const codePoint = character.codePointAt(0) || 0;
        return codePoint === 0x09 || codePoint === 0x0A || codePoint === 0x0D ||
            (codePoint >= 0x20 && codePoint <= 0xD7FF) ||
            (codePoint >= 0xE000 && codePoint <= 0xFFFD) ||
            (codePoint >= 0x10000 && codePoint <= 0x10FFFF);
    }).join('');
    return safe.replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function excelColumnName(index: number): string {
    let value = index + 1;
    let name = '';
    while (value > 0) {
        const remainder = (value - 1) % 26;
        name = String.fromCharCode(65 + remainder) + name;
        value = Math.floor((value - 1) / 26);
    }
    return name;
}

function uniqueSheetNames(sheets: CatalogExportSheet[]): string[] {
    const used = new Set<string>();
    return sheets.map((sheet, index) => {
        const base = sheet.name.replace(/[\\/?*:[\]]/g, '').replace(/^'+|'+$/g, '').trim().slice(0, 31) || `数据${index + 1}`;
        let name = base;
        let suffix = 2;
        while (used.has(name.toLowerCase())) {
            const ending = ` (${suffix++})`;
            name = `${base.slice(0, 31 - ending.length)}${ending}`;
        }
        used.add(name.toLowerCase());
        return name;
    });
}

function cellXml(reference: string, value: unknown, header: boolean): string {
    const style = header ? ' s="1"' : '';
    if (value === null || value === undefined || value === '') return `<c r="${reference}"${style}/>`;
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${reference}"${style} t="n"><v>${value}</v></c>`;
    if (typeof value === 'boolean') return `<c r="${reference}"${style} t="b"><v>${value ? 1 : 0}</v></c>`;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    return `<c r="${reference}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`;
}

function worksheetXml(rows: Record<string, unknown>[]): string {
    const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
    const lastColumn = columns.length ? excelColumnName(columns.length - 1) : 'A';
    const lastRow = rows.length + 1;
    const header = columns.length
        ? `<row r="1">${columns.map((column, index) => cellXml(`${excelColumnName(index)}1`, column, true)).join('')}</row>`
        : '';
    const body = rows.map((row, rowIndex) => `<row r="${rowIndex + 2}">${columns.map((column, columnIndex) =>
        cellXml(`${excelColumnName(columnIndex)}${rowIndex + 2}`, row[column], false)).join('')}</row>`).join('');
    const widths = columns.map((column, index) => {
        const width = Math.min(36, Math.max(12, column.length + 2));
        return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
    }).join('');
    const filter = columns.length && rows.length ? `<autoFilter ref="A1:${lastColumn}${lastRow}"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${lastRow}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="19"/><cols>${widths}</cols><sheetData>${header}${body}</sheetData>${filter}<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>`;
}

function stylesXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><color rgb="FFC2410C"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF7ED"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFFDBA74"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

export async function downloadCatalogWorkbook(fileName: string, sourceSheets: CatalogExportSheet[]): Promise<void> {
    if (!sourceSheets.length) throw new Error('没有可导出的图鉴数据');

    const names = uniqueSheetNames(sourceSheets);
    const sheets = sourceSheets.map(sheet => sheet.rows.map(row => flattenRecord(row)));
    const zip = new JSZip();
    const sheetOverrides = sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    const sheetEntries = names.map((name, index) => `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('');
    const sheetRelationships = names.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('');

    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheetOverrides}</Types>`);
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
    zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetEntries}</sheets></workbook>`);
    zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheetRelationships}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    zip.file('xl/styles.xml', stylesXml());
    sheets.forEach((rows, index) => zip.file(`xl/worksheets/sheet${index + 1}.xml`, worksheetXml(rows)));

    const blob = await zip.generateAsync({type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE', compressionOptions: {level: 5}});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
