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
} from 'docx';
import { OmmlConverter } from './omml-converter';
import { MathExportMode, WordExportOptions } from './export.types';

interface Segment {
  type: 'text' | 'inline-math' | 'display-math';
  content: string;
}

function parseLineSegments(line: string): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;

  while (cursor < line.length) {
    // Check for display math $$...$$
    if (line.startsWith('$$', cursor)) {
      const end = line.indexOf('$$', cursor + 2);
      if (end !== -1) {
        const math = line.slice(cursor + 2, end);
        segments.push({ type: 'display-math', content: math });
        cursor = end + 2;
        continue;
      }
    }

    // Check for inline math $...$
    if (line[cursor] === '$' && (cursor === 0 || line[cursor - 1] !== '\\')) {
      const end = line.indexOf('$', cursor + 1);
      if (end !== -1 && end > cursor + 1) {
        const math = line.slice(cursor + 1, end);
        segments.push({ type: 'inline-math', content: math });
        cursor = end + 1;
        continue;
      }
    }

    // Regular text
    let nextMath = line.indexOf('$', cursor);
    if (nextMath === -1) nextMath = line.length;

    const text = line.slice(cursor, nextMath);
    if (text) {
      segments.push({ type: 'text', content: text });
    }
    cursor = nextMath;
  }

  return segments;
}

export class DocxBuilder {
  private mathMode: MathExportMode;
  public formulasConverted = 0;
  public ommlFallbackCount = 0;
  public tablesCount = 0;

  constructor(mathMode: MathExportMode = 'omml') {
    this.mathMode = mathMode;
  }

  private buildParagraphChildren(line: string): (TextRun | ImportedXmlComponent)[] {
    const segments = parseLineSegments(line);
    const children: (TextRun | ImportedXmlComponent)[] = [];

    for (const seg of segments) {
      if (seg.type === 'inline-math') {
        this.formulasConverted++;
        if (this.mathMode === 'omml') {
          const { omml, isFallback } = OmmlConverter.latexToOmml(seg.content, false);
          if (isFallback) this.ommlFallbackCount++;
          children.push(ImportedXmlComponent.fromXmlString(omml));
        } else {
          children.push(
            new TextRun({
              text: `$${seg.content}$`,
              font: 'Cambria Math',
              color: '1E3A8A',
              bold: true,
            })
          );
        }
      } else if (seg.type === 'display-math') {
        this.formulasConverted++;
        if (this.mathMode === 'omml') {
          const { omml, isFallback } = OmmlConverter.latexToOmml(seg.content, false);
          if (isFallback) this.ommlFallbackCount++;
          children.push(ImportedXmlComponent.fromXmlString(omml));
        } else {
          children.push(
            new TextRun({
              text: `$$ ${seg.content} $$`,
              font: 'Cambria Math',
              color: '1E3A8A',
              bold: true,
            })
          );
        }
      } else {
        // Parse inline bold / italic / text
        let raw = seg.content;
        const parts = raw.split(/(\*\*.*?\*\*|\*.*?\*)/g);
        for (const p of parts) {
          if (!p) continue;
          if (p.startsWith('**') && p.endsWith('**') && p.length >= 4) {
            children.push(
              new TextRun({
                text: p.slice(2, -2),
                bold: true,
                font: 'Times New Roman',
                size: 26,
              })
            );
          } else if (p.startsWith('*') && p.endsWith('*') && p.length >= 2) {
            children.push(
              new TextRun({
                text: p.slice(1, -1),
                italics: true,
                font: 'Times New Roman',
                size: 26,
              })
            );
          } else {
            children.push(
              new TextRun({
                text: p,
                font: 'Times New Roman',
                size: 26,
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

    // Header: School & Department
    docElements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${options.schoolName || 'TRƯỜNG THCS QUANG TRUNG'} | ${options.department || 'TỔ TOÁN TIN'}`.toUpperCase(),
            bold: true,
            size: 24,
            font: 'Times New Roman',
            color: '1E3A8A',
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
      })
    );

    if (options.teacherName) {
      docElements.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `Giáo viên thực hiện: ${options.teacherName} | Năm học: 2026 - 2027`,
              italics: true,
              size: 22,
              font: 'Times New Roman',
              color: '475569',
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
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

        const rows = tableRows.map((row, rIdx) => {
          const isHeader = rIdx === 0;
          const cells = row.map((cellText) => {
            const cellChildren = this.buildParagraphChildren(cellText.trim());
            return new TableCell({
              width: { size: colWidthPct, type: WidthType.PERCENTAGE },
              shading: isHeader
                ? { type: ShadingType.CLEAR, fill: 'E2E8F0' }
                : undefined,
              children: [
                new Paragraph({
                  children: cellChildren.length > 0 ? cellChildren : [new TextRun({ text: '', font: 'Times New Roman' })],
                  spacing: { before: 80, after: 80 },
                }),
              ],
            });
          });

          return new TableRow({
            children: cells,
            tableHeader: isHeader,
          });
        });

        docElements.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          })
        );
        docElements.push(new Paragraph({ spacing: { after: 160 } }));
        tableRows = [];
      }
      inTable = false;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Check Markdown Table line
      if (line.startsWith('|') && line.endsWith('|')) {
        // Skip separator line |---|---|
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
        docElements.push(new Paragraph({ spacing: { after: 120 } }));
        continue;
      }

      // Headings
      if (line.startsWith('# ')) {
        docElements.push(
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: line.slice(2),
                bold: true,
                size: 32,
                font: 'Times New Roman',
                color: '1E40AF',
              }),
            ],
            spacing: { before: 240, after: 160 },
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
                size: 28,
                font: 'Times New Roman',
                color: '1E3A8A',
              }),
            ],
            spacing: { before: 200, after: 140 },
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
                size: 26,
                font: 'Times New Roman',
                color: '0F172A',
              }),
            ],
            spacing: { before: 160, after: 100 },
          })
        );
      } else if (line.startsWith('$$') && line.endsWith('$$') && line.length >= 4) {
        // Display math alone on line
        const mathContent = line.slice(2, -2).trim();
        this.formulasConverted++;
        if (this.mathMode === 'omml') {
          const { omml, isFallback } = OmmlConverter.latexToOmml(mathContent, true);
          if (isFallback) this.ommlFallbackCount++;
          docElements.push(
            new Paragraph({
              children: [ImportedXmlComponent.fromXmlString(omml)],
              alignment: AlignmentType.CENTER,
              spacing: { before: 140, after: 140 },
            })
          );
        } else {
          docElements.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `$$ ${mathContent} $$`,
                  font: 'Cambria Math',
                  color: '1E3A8A',
                  bold: true,
                  size: 26,
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { before: 140, after: 140 },
            })
          );
        }
      } else {
        // Standard Paragraph with inline math & text formatting
        const children = this.buildParagraphChildren(line);
        docElements.push(
          new Paragraph({
            children,
            spacing: { after: 120, line: 276 },
          })
        );
      }
    }

    if (inTable) flushTable();

    return new Document({
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1440, // 1 inch
                bottom: 1440,
                left: 1440,
                right: 1440,
              },
            },
          },
          children: docElements,
        },
      ],
    });
  }
}
