// DEV guard keeps demo authentication and handlers out of production behavior.
export const localMode = typeof import.meta.env !== 'undefined' && import.meta.env.DEV && import.meta.env.VITE_LOCAL_MODE === 'true';
export const mocksEnabled = typeof import.meta.env !== 'undefined' && import.meta.env.DEV && (localMode || import.meta.env.VITE_ENABLE_MOCKS === 'true');
