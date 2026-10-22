export default function StartupError({localMode, mocksEnabled}: {localMode: boolean; mocksEnabled: boolean}) {
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
        <section role="alert" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h1 className="text-lg font-semibold text-slate-800">{localMode ? '本地样例启动失败' : '应用启动失败'}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">{mocksEnabled
                ? '模拟接口未能就绪，请检查本地服务或浏览器设置，然后刷新重试。'
                : '启动时遇到异常，请刷新页面后重试。'}</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-5 rounded-xl bg-orange-500 px-4 py-2 text-sm font-medium text-white hover:bg-orange-600">刷新重试</button>
        </section>
    </main>;
}
