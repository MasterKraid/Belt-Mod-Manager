const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');

async function buildZip() {
  console.log('Building resources.zip...');
  const zip = new AdmZip();

  // Add the bundled server script as backend/server.js
  zip.addLocalFile(path.join(__dirname, 'backend', 'server.bundle.js'), 'backend', 'server.js');

  // Add views folder recursively
  zip.addLocalFolder(path.join(__dirname, 'views'), 'views');

  // Add public folder recursively
  zip.addLocalFolder(path.join(__dirname, 'public'), 'public');

  // Ensure target directory exists
  const targetDir = path.join(__dirname, 'src-tauri');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const outputPath = path.join(targetDir, 'resources.zip');
  zip.writeZip(outputPath);
  console.log('Successfully created resources.zip at:', outputPath);
}

buildZip().catch(err => {
  console.error('Failed to build resources.zip:', err);
  process.exit(1);
});
