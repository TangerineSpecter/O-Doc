import {createContext} from 'react';
import type {WorldDialogProps} from './WorldDialog';

export type DialogAppearance = Pick<WorldDialogProps, 'title' | 'description' | 'titleAction' | 'size' | 'fixedHeight'>;
export const WorldDialogContext = createContext<{title: string; update: (value: DialogAppearance) => void} | null>(null);
