import * as fs from 'fs';
import * as path from 'path';

interface EnableJSItem {
  body: string;
  url_host: string;
}

async function main() {
  try {
    // Read the JSON file
    const filePath = path.join(__dirname, '..', 'data', 'enable-javascript-stuff.json');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Parse the JSON
    const data: EnableJSItem[] = JSON.parse(fileContent);
    
    // Log each url_host
    data.forEach(item => {
      console.log(`'${item.url_host}',`);
    });
    
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
