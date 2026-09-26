import { Component, type ReactNode, type ErrorInfo } from 'react';
import { reportDiagnostic } from '@/utils/diagnostics';

export default class DiagnosticBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
    state = { failed: false };
    static getDerivedStateFromError() { return { failed: true }; }
    componentDidCatch(error: Error, info: ErrorInfo) {
        reportDiagnostic({ errorType: 'render', stack: error.stack || info.componentStack || '' }, error);
    }
    render() {
        if (this.state.failed) return <div className="m-8 rounded-2xl border border-red-100 bg-white p-6 text-slate-700"><p>页面出现异常，请刷新后重试。</p><button className="mt-4 rounded-xl bg-orange-500 px-4 py-2 text-white" onClick={() => window.location.reload()}>刷新页面</button></div>;
        return this.props.children;
    }
}
