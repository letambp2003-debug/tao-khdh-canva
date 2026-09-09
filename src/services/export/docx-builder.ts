import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  ShadingType,
  ImportedXmlComponent,
  Footer,
  PageNumber,
  NumberFormat,
} from 'docx';
import { OmmlConverter } from './omml-converter';
import { MathExportMode, PrintProfile, ProfileConfig, WordExportOptions } from './export.types';
import { PROFILES } from './word-export.config';

function sanitizeXmlText(text: string): string {
  if (!text) return '';
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F]/g, '');
}

function importOmmlComponents(xmlStr: string): (TextRun | ImportedXmlComponent)[] {
  const imported = ImportedXmlComponent.fromXmlString(xmlStr);
  const anyImported = imported as unknown as { rootKey?: string; root?: unknown[] };
  if (!anyImported.rootKey && Array.isArray(anyImported.root)) {
    return anyImported.root as unknown as (TextRun | ImportedXmlComponent)[];
  }
  return [imported];
}

interface Segment {
  type: 'text' | 'inline-math' | 'display-math';
  content: string;
}

function parseLineSegments(line: string): Segment[] {
  const cleanLine = sanitizeXmlText(line);
  const segments: Segment[] = [];
  let cursor = 0;

  while (cursor < cleanLine.length) {
    if (cleanLine.startsWith('$$', cursor)) {
      const end = cleanLine.indexOf('$$', cursor + 2);
      if (end !== -1) {
        const math = cleanLine.slice(cursor + 2, end);
        segments.push({ type: 'display-math', content: math });
        cursor = end + 2;
        continue;
      }
    }

    if (cleanLine[cursor] === '$' && (cursor === 0 || cleanLine[cursor - 1] !== '\\')) {
      const end = cleanLine.indexOf('$', cursor + 1);
      if (end !== -1 && end > cursor + 1) {
        const math = cleanLine.slice(cursor + 1, end);
        segments.push({ type: 'inline-math', content: math });
        cursor = end + 1;
        continue;
      }
    }

    let nextMath = cleanLine.indexOf('$', cursor);
    if (nextMath === -1) nextMath = cleanLine.length;

    const text = cleanLine.slice(cursor, nextMath);
    if (text) {
      segments.push({ type: 'text', content: text });
    }
    cursor = nextMath;
  }

  return segments;
}

export class DocxBuilder {
  private mathMode: MathExportMode;
  private profile: ProfileConfig;
  public formulasConverted = 0;
  public ommlFallbackCount = 0;
  public tablesCount = 0;

  constructor(mathMode: MathExportMode = 'omml', printProfile: PrintProfile = 'COMPACT_PRINT') {
    this.mathMode = mathMode;
    this.profile = PROFILES[printProfile] || PROFILES.COMPACT_PRINT;
  }

  private buildParagraphChildren(line: string, fontSize?: number): (TextRun | ImportedXmlComponent)[] {
    const segments = parseLineSegments(line);
    const children: (TextRun | ImportedXmlComponent)[] = [];
    const targetSize = fontSize || this.profile.bodyFontSize;

    for (const seg of segments) {
      if (seg.type === 'inline-math') {
        this.formulasConverted++;
        if (this.mathMode === 'omml') {
          const { omml, isFallback } = OmmlConverter.latexToOmml(seg.content, false);
          if (isFallback) this.ommlFallbackCount++;
          children.push(...importOmmlComponents(omml));
        } else {
          children.push(
            new TextRun({
              text: `$${seg.content}$`,
              font: this.profile.mathFontFamily,
              color: '000000',
              bold: true,
              size: targetSize,
            })
          );
        }
      } else if (seg.type === 'display-math') {
        this.formulasConverted++;
        if (this.mathMode === 'omml') {
          const { omml, isFallback } = OmmlConverter.latexToOmml(seg.content, false);
          if (isFallback) this.ommlFallbackCount++;
          children.push(...importOmmlComponents(omml));
        } else {
          children.push(
            new TextRun({
              text: `$$ ${seg.content} $$`,
              font: this.profile.mathFontFamily,
              color: '000000',
              bold: true,
              size: targetSize,
            })
          );
        }
      } else {
        let raw = seg.content;
        const parts = raw.split(/(\*\*.*?\*\*|\*.*?\*)/g);
        for (const p of parts) {
          if (!p) continue;
          if (p.startsWith('**') && p.endsWith('**') && p.length >= 4) {
            children.push(
              new TextRun({
                text: p.slice(2, -2),
                bold: true,
                font: this.profile.fontFamily,
                size: targetSize,
                color: '000000',
              })
            );
          } else if (p.startsWith('*') && p.endsWith('*') && p.length >= 2) {
            children.push(
              new TextRun({
                text: p.slice(1, -1),
                italics: true,
                font: this.profile.fontFamily,
                size: targetSize,
                color: '000000',
              })
            );
          } else {
            children.push(
              new TextRun({
                text: p,
                font: this.profile.fontFamily,
                size: targetSize,
                color: '000000',
              })
            );
          }
        }
      }
    }

    return children;
  }

  public build(options: WordExportOptions): Document {
    const docElements: (Paragraph | Table)[] = [];

    // 1. Header (School & Department) - Compact publication style
    docElements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${options.schoolName || 'TRƯỜNG THCS QUANG TRUNG'} | ${options.department || 'TỔ TOÁN TIN'}`.toUpperCase(),
            bold: true,
            size: this.profile.heading2Size,
            font: this.profile.fontFamily,
            color: '000000',
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 60 },
        keepNext: true,
      })
    );

    if (options.teacherName) {
      docElements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Giáo viên thực hiện: ${options.teacherName} — Năm học: 2026 - 2027`,
              italics: true,
              size: this.profile.bodyFontSize - 2,
              font: this.profile.fontFamily,
              color: '333333',
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 0, after: 140 },
          keepNext: true,
        })
      );
    }

    const lines = options.markdown.split('\n');
    let inTable = false;
    let tableRows: string[][] = [];

    const flushTable = () => {
      if (tableRows.length > 0) {
        this.tablesCount++;
        const numCols = Math.max(...tableRows.map((r) => r.length));
        const colWidthPct = Math.floor(100 / numCols);

        const cellMargin = this.profile.compactTablePadding
          ? { top: 60, bottom: 60, left: 100, right: 100 }
          : { top: 100, bottom: 100, left: 140, right: 140 };

        const rows = tableRows.map((row, rIdx) => {
          const isHeader = rIdx === 0;
          const cells = row.map((cellText) => {
            const cellLines = cellText.split(/<br\s*\/?>/gi);
            const cellParagraphs = cellLines.map((cL) => {
              const cellChildren = this.buildParagraphChildren(cL.trim(), this.profile.tableFontSize);
              return new Paragraph({
                children: cellChildren.length > 0 ? cellChildren : [new TextRun({ text: '', font: this.profile.fontFamily })],
                spacing: { before: 20, after: 20, line: this.profile.lineSpacing },
                alignment: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
              });
            });

            return new TableCell({
              width: { size: colWidthPct, type: WidthType.PERCENTAGE },
              shading: isHeader
                ? { type: ShadingType.CLEAR, fill: 'F1F5F9' }
                : undefined,
              margins: cellMargin,
              children: cellParagraphs.length > 0 ? cellParagraphs : [
                new Paragraph({
                  children: [new TextRun({ text: '', font: this.profile.fontFamily })],
                  spacing: { before: 20, after: 20, line: this.profile.lineSpacing },
                  alignment: isHeader ? AlignmentType.CENTER : AlignmentType.LEFT,
                }),
              ],
            });
          });

          return new TableRow({
            children: cells,
            tableHeader: isHeader,
            cantSplit: true,
          });
        });

        docElements.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          })
        );
        docElements.push(new Paragraph({ spacing: { before: 0, after: 60 } }));
        tableRows = [];
      }
      inTable = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check Table line
      if (line.startsWith('|') && line.endsWith('|')) {
        if (/^\|[\s\-:\|]+\|$/.test(line)) {
          continue;
        }
        inTable = true;
        const cols = line
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());
        tableRows.push(cols);
        continue;
      } else if (inTable) {
        flushTable();
      }

      if (!line) {
        continue;
      }

      // Headings with keepNext = true
      if (line.startsWith('# ')) {
        docElements.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: line.slice(2),
                bold: true,
                size: this.profile.heading1Size,
                font: this.profile.fontFamily,
                color: '000000',
              }),
            ],
            spacing: { before: 160, after: 80, line: this.profile.lineSpacing },
            keepNext: true,
          })
        );
      } else if (line.startsWith('## ')) {
        docElements.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [
              new TextRun({
                text: line.slice(3),
                bold: true,
                size: this.profile.heading2Size,
                font: this.profile.fontFamily,
                color: '000000',
              }),
            ],
            spacing: { before: 120, after: 60, line: this.profile.lineSpacing },
            keepNext: true,
          })
        );
      } else if (line.startsWith('### ')) {
        docElements.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_3,
            children: [
              new TextRun({
                text: line.slice(4),
                bold: true,
                size: this.profile.heading3Size,
                font: this.profile.fontFamily,
                color: '000000',
              }),
            ],
            spacing: { before: 80, after: 40, line: this.profile.lineSpacing },
            keepNext: true,
          })
        );
      } else if (line.startsWith('$$') && line.endsWith('$$') && line.length >= 4) {
        const mathContent = line.slice(2, -2).trim();
        this.formulasConverted++;
        if (this.mathMode === 'omml') {
          const { omml, isFallback } = OmmlConverter.latexToOmml(mathContent, true);
          if (isFallback) this.ommlFallbackCount++;
          docElements.push(
            new Paragraph({
              children: importOmmlComponents(omml),
              alignment: AlignmentType.CENTER,
              spacing: { before: 60, after: 60 },
              keepNext: true,
            })
          );
        } else {
          docElements.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `$$ ${mathContent} $$`,
                  font: this.profile.mathFontFamily,
                  color: '000000',
                  bold: true,
                  size: this.profile.bodyFontSize,
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 60, after: 60 },
              keepNext: true,
            })
          );
        }
      } else {
        // Regular Paragraph - Justified alignment & compact spacing
        const children = this.buildParagraphChildren(line);
        docElements.push(
          new Paragraph({
            children,
            spacing: { before: 0, after: this.profile.paragraphSpacingAfter, line: this.profile.lineSpacing },
            alignment: AlignmentType.JUSTIFIED,
          })
        );
      }
    }

    if (inTable) flushTable();

    return new Document({
      styles: {
        default: {
          document: {
            run: {
              font: this.profile.fontFamily,
              size: this.profile.bodyFontSize,
              color: '000000',
            },
            paragraph: {
              spacing: { before: 0, after: this.profile.paragraphSpacingAfter, line: this.profile.lineSpacing },
              alignment: AlignmentType.JUSTIFIED,
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: this.profile.margins,
              pageNumbers: {
                start: 1,
                formatType: NumberFormat.DECIMAL,
              },
            },
          },
          footers: {
            default: new Footer({
              children: [
                new Paragraph({
                  alignment: AlignmentType.RIGHT,
                  children: [
                    new TextRun({
                      text: 'Trang ',
                      font: this.profile.fontFamily,
                      size: 20,
                      color: '64748B',
                    }),
                    new TextRun({
                      children: [PageNumber.CURRENT],
                      font: this.profile.fontFamily,
                      size: 20,
                      color: '64748B',
                    }),
                  ],
                }),
              ],
            }),
          },
          children: docElements,
        },
      ],
    });
  }
}
