/** Rasterize once so ECharts uses a circular image without relying on SVG external resources. */
export function circularRelationAvatar(avatar: string): Promise<string | null> {
    return new Promise(resolve => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
            try {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 128;
                const context = canvas.getContext('2d');
                if (!context || !image.naturalWidth || !image.naturalHeight) {
                    resolve(null);
                    return;
                }
                context.beginPath();
                context.arc(64, 64, 64, 0, Math.PI * 2);
                context.clip();
                const side = Math.min(image.naturalWidth, image.naturalHeight);
                context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 128, 128);
                resolve(`image://${canvas.toDataURL('image/png')}`);
            } catch {
                resolve(null);
            }
        };
        image.onerror = () => resolve(null);
        image.src = avatar;
    });
}
