// frontend_react/src/components/AIChatWindow/utils/imageProcess.ts

export const MAX_CHAT_IMAGES = 6;
export const MAX_IMAGE_FILE_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * 校验文件是否为合规图片
 */
export const validateImageFile = (file: File): { valid: boolean; error?: string } => {
    if (!file.type.startsWith('image/')) {
        return { valid: false, error: '请上传有效的图片文件' };
    }
    if (file.size > MAX_IMAGE_FILE_SIZE) {
        return { valid: false, error: '单张图片大小不能超过 20MB' };
    }
    return { valid: true };
};

/**
 * 将图片文件自适应缩放并转换为 Base64 Data URL
 * 兼顾模型识别清晰度（长边最大 1920px）和体积（约 100~300KB），避免卡顿和存储溢出
 */
export const processImageFile = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('读取图片文件失败'));
        reader.onload = () => {
            const result = reader.result;
            if (typeof result !== 'string') {
                reject(new Error('无法解析图片内容'));
                return;
            }

            // 对于 GIF 等动图，直接保留原 Data URL
            if (file.type === 'image/gif') {
                resolve(result);
                return;
            }

            const img = new Image();
            img.onerror = () => reject(new Error('加载图片元素失败'));
            img.onload = () => {
                try {
                    const maxDimension = 1920;
                    let width = img.width;
                    let height = img.height;

                    if (width > maxDimension || height > maxDimension) {
                        if (width > height) {
                            height = Math.round((height * maxDimension) / width);
                            width = maxDimension;
                        } else {
                            width = Math.round((width * maxDimension) / height);
                            height = maxDimension;
                        }
                    }

                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        resolve(result);
                        return;
                    }

                    ctx.drawImage(img, 0, 0, width, height);

                    // 优先压缩为 jpeg，质量 0.85
                    const outputMime = file.type === 'image/png' && file.size < 600 * 1024 ? 'image/png' : 'image/jpeg';
                    const compressedDataUrl = canvas.toDataURL(outputMime, 0.85);
                    resolve(compressedDataUrl);
                } catch {
                    resolve(result);
                }
            };
            img.src = result;
        };
        reader.readAsDataURL(file);
    });
};
