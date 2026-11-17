// Small, valid PDFs for exercising the real Poppler commands without a browser.
// The first page is red; subsequent pages are blue, making page selection visible.
export function createCertificatePdfFixture(pageTexts: readonly string[]): Buffer {
  const fontId = 3 + pageTexts.length * 2;
  const pageIds = pageTexts.map((_, index) => 3 + index * 2);
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageTexts.length} >>`,
  ];
  for (const [index, text] of pageTexts.entries()) {
    const contentId = pageIds[index] + 1;
    const escapedText = text.replace(/[\\()]/g, '\\$&');
    const color = index === 0 ? '1 0 0' : '0 0 1';
    const content = `${color} rg 0 0 600 400 re f\n0 0 0 rg BT /F1 10 Tf 20 200 Td (${escapedText}) Tj ET\n`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 400] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
    );
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
