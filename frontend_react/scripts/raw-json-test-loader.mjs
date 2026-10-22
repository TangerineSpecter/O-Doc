import {readFile} from 'node:fs/promises';

// Match Vite's ?raw import when exercising the local API fixtures in Node.
export async function load(url, context, nextLoad) {
    if (!url.endsWith('.json?raw')) return nextLoad(url, context);
    const file = new URL(url);
    file.search = '';
    return {format: 'module', shortCircuit: true,
        source: `export default ${JSON.stringify(await readFile(file, 'utf8'))};`};
}
