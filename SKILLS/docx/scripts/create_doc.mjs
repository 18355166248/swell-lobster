import { Document, Packer, Paragraph, TextRun } from 'docx';
import fs from 'fs';
import path from 'path';

const doc = new Document({
  sections: [{
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: "今天A股行情",
            bold: true,
            size: 32,
          }),
        ],
      }),
    ],
  }],
});

const buffer = await Packer.toBuffer(doc);
fs.writeFileSync(path.join(process.env.OUTPUT_DIR, 'test.docx'), buffer);
console.log('Document created successfully: test.docx');
