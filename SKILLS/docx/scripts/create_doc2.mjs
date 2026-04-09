import { Document, Packer, Paragraph, TextRun } from 'docx';
import fs from 'fs';
import path from 'path';

const outputDir = process.env.OUTPUT_DIR;
console.log('OUTPUT_DIR:', outputDir);

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
const filePath = path.join(outputDir, 'test.docx');
fs.writeFileSync(filePath, buffer);

console.log('File saved to:', filePath);
console.log('File exists:', fs.existsSync(filePath));
console.log('File size:', fs.statSync(filePath).size);
