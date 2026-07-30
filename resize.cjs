const sharp = require('sharp');

async function run() {
  await sharp('public/logo.jpg').resize(512, 512).toFile('public/logo512.png');
  await sharp('public/logo.jpg').resize(192, 192).toFile('public/logo192.png');
  console.log('Resized icons created.');
}

run();
