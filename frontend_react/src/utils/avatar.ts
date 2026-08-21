export const isImageAvatarValue = (avatar?: string | null): boolean => {
    const value = avatar?.trim();
    return Boolean(
        value && (
            /^https?:\/\//i.test(value)
            || value.startsWith('/')
            || value.startsWith('blob:')
            || value.startsWith('data:image/')
        )
    );
};
