// lib/report-pdf.ts
//
// One timestamped compliance record per system: Q&A answers, classification and reasoning,
// pessimistic outlook, governance structure and the evidence checklist with current status.
// Built with pdf-lib (pure JS, no font files, works in Vercel serverless).
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { getAnswerRows } from './assessment-flow';
import type { SystemReport } from './system-report';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  complete: 'Complete',
  not_applicable: 'Not applicable',
};

const COLORS = {
  text: rgb(0.1, 0.1, 0.12),
  muted: rgb(0.42, 0.44, 0.48),
  heading: rgb(0.1, 0.25, 0.55),
  rule: rgb(0.82, 0.84, 0.87),
  warn: rgb(0.65, 0.3, 0.05),
};

class Writer {
  private page!: PDFPage;
  private y = 0;
  private allowed: Set<number>;

  constructor(private doc: PDFDocument, private font: PDFFont, private bold: PDFFont) {
    this.allowed = new Set(font.getCharacterSet());
    this.newPage();
  }

  /** Standard PDF fonts only encode WinAnsi; replace anything else rather than throw. */
  clean(text: string): string {
    let out = '';
    for (const ch of text.replace(/\r/g, '').replace(/\t/g, ' ')) {
      const cp = ch.codePointAt(0)!;
      if (ch === '\n') out += ch;
      else if (cp < 32) out += ' ';
      else out += this.allowed.has(cp) ? ch : '?';
    }
    return out;
  }

  private newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  private ensure(height: number) {
    if (this.y - height < MARGIN + 20) this.newPage();
  }

  space(h: number) {
    this.y -= h;
  }

  private wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of this.clean(text).split('\n')) {
      const words = paragraph.split(' ');
      let line = '';
      for (const word of words) {
        // Break words that are longer than a whole line (e.g. long URLs)
        let w = word;
        while (font.widthOfTextAtSize(w, size) > width) {
          let cut = w.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--;
          if (line) {
            lines.push(line);
            line = '';
          }
          lines.push(w.slice(0, cut));
          w = w.slice(cut);
        }
        const candidate = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
        else {
          lines.push(line);
          line = w;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  text(
    text: string,
    opts: { size?: number; bold?: boolean; indent?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}
  ) {
    const size = opts.size ?? 10;
    const font = opts.bold ? this.bold : this.font;
    const indent = opts.indent ?? 0;
    const lineH = size * 1.35;
    for (const line of this.wrap(text, font, size, CONTENT_W - indent)) {
      this.ensure(lineH);
      this.y -= lineH;
      if (line) this.page.drawText(line, { x: MARGIN + indent, y: this.y, size, font, color: opts.color ?? COLORS.text });
    }
    this.y -= opts.gap ?? 2;
  }

  heading(text: string) {
    this.ensure(40);
    this.space(12);
    this.text(text, { size: 13, bold: true, color: COLORS.heading, gap: 3 });
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.7,
      color: COLORS.rule,
    });
    this.space(6);
  }

  subheading(text: string) {
    this.ensure(24);
    this.space(4);
    this.text(text, { size: 10.5, bold: true, gap: 2 });
  }

  keyValue(label: string, value: string) {
    this.text(`${label}: ${value}`, { indent: 0, gap: 1 });
  }

  /** Footer on every page: page number and the report generation timestamp. */
  footers(generatedAt: string) {
    const pages = this.doc.getPages();
    pages.forEach((p, i) => {
      p.drawText(this.clean(`Report generated ${generatedAt}`), {
        x: MARGIN,
        y: 28,
        size: 8,
        font: this.font,
        color: COLORS.muted,
      });
      const label = `Page ${i + 1} of ${pages.length}`;
      p.drawText(label, {
        x: PAGE_W - MARGIN - this.font.widthOfTextAtSize(label, 8),
        y: 28,
        size: 8,
        font: this.font,
        color: COLORS.muted,
      });
    });
  }
}

export async function buildReportPdf(report: SystemReport, generatedAt: Date): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(doc, font, bold);

  const { assessment, answers, governanceRequirements, uncertainty, checklist, rules, australia } = report;
  const generated = generatedAt.toISOString();

  doc.setTitle(`Compliance record - ${assessment.systemName}`);
  doc.setCreationDate(generatedAt);

  // Title block
  w.text('EU AI Act Compliance Record', { size: 11, color: COLORS.muted, gap: 2 });
  w.text(assessment.systemName, { size: 20, bold: true, gap: 6 });
  w.keyValue('Assessment ID', assessment.id);
  w.keyValue('Assessment run', assessment.timestamp);
  w.keyValue('Report generated', generated);
  w.keyValue('Rules version', assessment.rulesVersion);
  w.text(
    'The assessment timestamp is when the questionnaire was submitted. Checklist status and owners below reflect the current state at report generation and may have changed since.',
    { size: 8.5, color: COLORS.muted }
  );

  // 1. Q&A
  w.heading('1. Assessment answers');
  if (answers) {
    let section = '';
    for (const row of getAnswerRows(answers, rules)) {
      if (row.section !== section) {
        section = row.section;
        w.subheading(section);
      }
      w.text(`${row.label}: ${row.value}`, { indent: 8, gap: 1 });
    }
  } else {
    w.text('The submitted answers were not recorded for this assessment (created before the questionnaire was introduced).', {
      color: COLORS.muted,
    });
    w.keyValue('Description', assessment.description);
    w.keyValue('Industry', assessment.metadata.industry);
    w.keyValue('Geographies', (assessment.metadata.geographies ?? []).join(', '));
  }

  // 2. Classification
  w.heading('2. Classification and reasoning');
  w.keyValue('Classification', assessment.classification.replace(/_/g, ' '));
  w.keyValue('Confidence', `${Math.round(assessment.confidenceScore)}%`);
  w.keyValue('Evidence strength', `${Math.round(assessment.evidenceStrength)}%`);
  if (assessment.riskScore !== undefined) w.keyValue('Organisational risk score', `${assessment.riskScore}/25`);
  w.space(3);
  w.text(assessment.reasoning);
  if (assessment.violations.length) {
    w.subheading('Prohibited practices identified');
    for (const v of assessment.violations) w.text(`- ${v.name} (Article ${v.article}): ${v.description}`, { indent: 8, gap: 1 });
  }
  if (assessment.applicableArticles.length) {
    w.subheading('Applicable articles');
    for (const a of assessment.applicableArticles) w.text(`- ${a}`, { indent: 8, gap: 1 });
  }

  // Sections after classification are numbered in the order they appear
  let section = 2;

  // Pessimistic outlook
  if (uncertainty) {
    w.heading(`${++section}. Pessimistic outlook`);
    w.text(uncertainty.note, { color: COLORS.warn });
    w.keyValue('Worst case', uncertainty.worstCaseClassification.replace(/_/g, ' '));
    if (uncertainty.unsureQuestions.length) {
      w.subheading('Answers marked unsure');
      for (const u of uncertainty.unsureQuestions) {
        w.text(`- ${u.label}: ${u.treatedAs}`, { indent: 8, gap: 1 });
      }
    }
    if (uncertainty.challengedAnswers.length) {
      w.subheading('"No" answers that conflict with other information');
      for (const c of uncertainty.challengedAnswers) {
        w.text(`- ${c.label}`, { indent: 8, bold: true, gap: 1 });
        for (const s of c.signals) w.text(`Evidence: ${s}`, { indent: 18, size: 9, gap: 1 });
        w.text(`Justification: ${c.justification || 'none recorded'}`, { indent: 18, size: 9, gap: 2 });
      }
    }
  }

  // Australia alignment (only when Australia was selected)
  if (australia) {
    w.heading(`${++section}. Australia AI adoption guidance and EU AI Act alignment`);
    w.text(`BEST EFFORT - EXPERT REVIEW REQUIRED. ${australia.caveat}`, { size: 9, bold: true, color: COLORS.warn });
    w.text(
      `${australia.standard.name} (${australia.standard.publisher}, ${australia.standard.published}). Voluntary; supersedes the ${australia.standard.supersedes}. Assessed at the ${australia.level} level.`,
      { size: 9, color: COLORS.muted }
    );
    w.keyValue('Australian voluntary standard', `${australia.vaiss.verdict.replace(/_/g, ' ')} - ${australia.vaiss.summary}`);
    w.keyValue('EU AI Act', `${australia.euAiAct.verdict.replace(/_/g, ' ')} - ${australia.euAiAct.summary}`);
    w.subheading('How this was decided');
    australia.reasoning.forEach((r, i) => w.text(`${i + 1}. ${r}`, { indent: 8, size: 9, gap: 1 }));
    w.subheading('Six essential practices');
    for (const p of australia.practices) {
      w.text(`${p.number}. ${p.name} [${p.status}]`, { indent: 8, bold: true, gap: 1 });
      w.text(`VAISS guardrails: ${p.guardrails.map(g => g.number).join(', ')}`, { indent: 18, size: 9, color: COLORS.muted, gap: 1 });
      for (const a of p.actions) w.text(`Action: ${a}`, { indent: 18, size: 9, gap: 1 });
    }
    if (australia.euAiAct.obligations.length) {
      w.subheading('EU obligations checked against these controls');
      for (const o of australia.euAiAct.obligations) w.text(`- [${o.status.replace(/_/g, ' ')}] ${o.obligation}`, { indent: 8, size: 9, gap: 1 });
    }
    w.subheading('Where the two differ');
    for (const c of australia.crossCheck) w.text(`- ${c}`, { indent: 8, size: 9, gap: 1 });
  }

  // Governance
  w.heading(`${++section}. Governance structure`);
  if (governanceRequirements.length) {
    for (const g of governanceRequirements) {
      w.subheading(g.role.replace(/_/g, ' '));
      w.keyValue('Owner role', g.ownerRole);
      w.keyValue('Review cadence', g.reviewCadence);
      w.keyValue('Escalation trigger', g.escalationTrigger);
    }
  } else {
    w.text('No governance structure recorded (roles were not captured for this assessment).', { color: COLORS.muted });
  }

  // Checklist
  w.heading(`${++section}. Evidence checklist (state at report generation)`);
  if (checklist.length) {
    checklist.forEach((item, i) => {
      const heading = item.title.startsWith(item.obligationArticle) ? item.title : `${item.obligationArticle}: ${item.title}`;
      w.text(`${i + 1}. [${STATUS_LABEL[item.status] ?? item.status}] ${heading}`, {
        bold: true,
        gap: 1,
      });
      w.text(`Required artifact: ${item.requiredArtifact}`, { indent: 14, size: 9, gap: 1 });
      w.text(`Owner: ${item.owner || 'Unassigned'}`, { indent: 14, size: 9, gap: 1 });
      w.text(`Evidence link: ${item.evidenceLink || 'None'}`, { indent: 14, size: 9, gap: 1 });
      w.text(`Last updated: ${item.lastUpdated}`, { indent: 14, size: 9, color: COLORS.muted, gap: 5 });
    });
  } else {
    w.text('No checklist items for this classification.', { color: COLORS.muted });
  }

  w.footers(generated);
  return doc.save();
}

/** `<systemName>-compliance-record-<YYYY-MM-DD>.pdf`, safe for a Content-Disposition header. */
export function reportFilename(systemName: string, date: Date): string {
  const safe =
    systemName
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'system';
  return `${safe}-compliance-record-${date.toISOString().slice(0, 10)}.pdf`;
}
