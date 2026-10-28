import {createRoot} from 'react-dom/client';
import {MemoryRouter, Route, Routes} from 'react-router-dom';
import '../../src/index.css';
import NovelPage from '../../src/views/NovelPage';
import {localMode} from '../../src/config/development';
import {worker} from '../../src/mocks/browser';
import {clearAuthToken, saveAuthToken} from '../../src/utils/authStorage';

if (!localMode) throw new Error('小说阅读验收页只能在纯 local 模式运行');
if (new URLSearchParams(location.search).get('mockState') === 'empty') saveAuthToken('local-demo-token', false);
else clearAuthToken();
await worker.start({onUnhandledRequest: 'bypass'});
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/novel/local-novel-reader']}><Routes><Route path="/novel/:collId" element={<NovelPage/>}/></Routes></MemoryRouter>);
