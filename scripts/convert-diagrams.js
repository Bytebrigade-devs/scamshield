const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const diagrams = [
  { svg: '1-use-case-diagram.svg', png: 'use case.png' },
  { svg: '2-activity-diagram.svg', png: 'activity diagram.png' },
  { svg: '3-sequence-diagram.svg', png: 'sequence diagram.png' },
  { svg: '4-class-er-diagram.svg', png: 'class and database architecture diagram.png' },
  { svg: '5-system-architecture.svg', png: 'Subsystem architecture .png' }
];

async function convert() {
  const dir = path.join(__dirname, '..', 'docs', 'diagrams');
  for (const d of diagrams) {
    const svgPath = path.join(dir, d.svg);
    const pngPath = path.join(dir, d.png);
    console.log(`Converting ${d.svg} -> ${d.png}...`);
    const svgBuffer = fs.readFileSync(svgPath);
    await sharp(svgBuffer, { density: 200 })
      .png()
      .toFile(pngPath);
    console.log(`Saved: ${pngPath}`);
  }
}

convert().then(() => console.log('All diagrams successfully converted to high-res PNG!'))
  .catch(err => {
    console.error('Error during conversion:', err);
    process.exit(1);
  });
