const PDFDocument = require('pdfkit');

// Builds a one-page PDF receipt for a single signature event (a pickup or a
// return), listing exactly the components that signature covered.
function buildReceiptBuffer(wo, event) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const typeLabel = event.type === 'out' ? 'Vendor Pickup Receipt' : 'Vendor Return Receipt';

    doc.fontSize(20).text(typeLabel, { align: 'center' });
    doc.moveDown(1.2);

    doc.fontSize(11);
    doc.text(`Work Order #: ${wo.woNumber || '\u2014'}`);
    doc.text(`PO #: ${wo.poNumber || '\u2014'}`);
    doc.text(`Vendor: ${wo.vendorName || '\u2014'}`);
    doc.text(`Date / Time: ${new Date(event.timestamp).toLocaleString()}`);
    doc.moveDown(1);

    doc.fontSize(13).text('Items Covered By This Signature', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(11);

    const items = (wo.components || []).filter((c) => event.componentIds.includes(c.id));
    if (items.length === 0) {
      doc.text('(No items recorded)');
    } else {
      items.forEach((c, i) => {
        doc.text(`${i + 1}. ${c.description || '(no description)'}`);
      });
    }

    doc.moveDown(1.2);
    doc.fontSize(13).text('Signed By', { underline: true });
    doc.moveDown(0.4);
    doc.fontSize(11).text(event.signerName || '(name not recorded)');

    if (event.signatureImage) {
      try {
        const base64 = event.signatureImage.split(',')[1] || event.signatureImage;
        const imgBuffer = Buffer.from(base64, 'base64');
        doc.moveDown(0.5);
        doc.image(imgBuffer, { width: 220 });
      } catch (e) {
        doc.moveDown(0.5);
        doc.fontSize(9).fillColor('#888').text('(signature image could not be embedded)');
        doc.fillColor('#000');
      }
    }

    doc.moveDown(2);
    doc.fontSize(9).fillColor('#888')
      .text('Generated automatically by Vendor Work Tracker.', { align: 'center' });

    doc.end();
  });
}

module.exports = { buildReceiptBuffer };
