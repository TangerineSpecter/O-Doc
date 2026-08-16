import {existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export async function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-zA-Z0-9]+$/.test(specifier)) {
        const parentDir = dirname(fileURLToPath(context.parentURL));
        for (const ext of ['.ts', '.tsx', '.js', '.mjs']) {
            const candidate = join(parentDir, specifier + ext);
            if (existsSync(candidate)) {
                return {
                    shortCircuit: true,
                    url: pathToFileURL(candidate).href,
                };
            }
        }
    }
    return nextResolve(specifier, context);
}
