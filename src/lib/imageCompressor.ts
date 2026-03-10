export const compressImage = async (file: File, targetSizeKB: number = 250): Promise<File> => {
    // 画像以外はそのまま返す
    if (!file.type.startsWith('image/')) return file;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // 初期の最大幅/高さ制限 (例: 1600px程度) に抑える
                const MAX_DIMENSION = 1600;
                if (width > height && width > MAX_DIMENSION) {
                    height = Math.floor(height * (MAX_DIMENSION / width));
                    width = MAX_DIMENSION;
                } else if (height > MAX_DIMENSION) {
                    width = Math.floor(width * (MAX_DIMENSION / height));
                    height = MAX_DIMENSION;
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return resolve(file); // fallback
                ctx.drawImage(img, 0, 0, width, height);

                let quality = 0.9;
                const targetBytes = targetSizeKB * 1024;

                const tryCompress = (q: number) => {
                    canvas.toBlob((blob) => {
                        if (!blob) return resolve(file);

                        // ターゲットサイズ以下、または品質限界の場合は終了
                        if (blob.size <= targetBytes || q <= 0.1) {
                            const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                                type: 'image/jpeg',
                                lastModified: Date.now()
                            });
                            resolve(newFile);
                        } else {
                            // 画質を下げて再度試行 (画像サイズをさらに少し縮小するアプローチも可能)
                            if (q > 0.4) {
                                tryCompress(q - 0.1);
                            } else {
                                // 品質0.4以下でもサイズが大きい場合は、解像度自体を下げる
                                width = Math.floor(width * 0.8);
                                height = Math.floor(height * 0.8);
                                canvas.width = width;
                                canvas.height = height;
                                ctx.drawImage(img, 0, 0, width, height);
                                tryCompress(0.8); // 品質リセットして再試行
                            }
                        }
                    }, 'image/jpeg', q);
                };

                tryCompress(quality);
            };
            img.onerror = (e) => reject(e);
            img.src = event.target?.result as string;
        };
        reader.onerror = (e) => reject(e);
    });
};
