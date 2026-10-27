import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import react from '../../../frontend_react/node_modules/@vitejs/plugin-react/dist/index.js';

// This development-only server exposes the repository so previews can use the
// same checked-in assets and components as the application without copying them.
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const frontend = resolve(repository, 'frontend_react');

export default {
    root: repository,
    plugins: [react()],
    resolve: {
        alias: [
            {find: 'react-dom', replacement: resolve(frontend, 'node_modules/react-dom')},
            {find: 'react', replacement: resolve(frontend, 'node_modules/react')},
            {find: '@', replacement: resolve(frontend, 'src')},
        ],
    },
    css: {postcss: frontend},
    server: {host: '127.0.0.1', port: 43138, strictPort: true},
};
