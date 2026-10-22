/** Remove only MSW registrations; other workers belong to the application. */
export async function clearMockWorkers(container?: Pick<ServiceWorkerContainer, 'getRegistrations'>): Promise<void> {
    if (!container) return;
    const registrations = await container.getRegistrations();
    const mocks = registrations.filter(registration => {
        const script = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL;
        return script && new URL(script).pathname === '/mockServiceWorker.js';
    });
    await Promise.all(mocks.map(registration => registration.unregister()));
}
