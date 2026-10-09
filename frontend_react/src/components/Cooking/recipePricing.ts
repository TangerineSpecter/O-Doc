export const recipeStarTiers = [
    {star: 1, rate: '1.0', multiplierTenths: 10n},
    {star: 2, rate: '1.2', multiplierTenths: 12n},
    {star: 3, rate: '1.5', multiplierTenths: 15n},
    {star: 4, rate: '1.8', multiplierTenths: 18n},
    {star: 5, rate: '2.2', multiplierTenths: 22n},
] as const;

export function recipeStarPrices(salePrice: string, previewValues?: readonly string[]): string[] {
    if (previewValues?.length === 5) return [...previewValues];

    // 接口金额为非负十进制字符串；以整数分子计算，匹配后端 Decimal 的向上取整。
    const [whole, fraction = ''] = salePrice.split('.');
    const units = BigInt(whole + fraction);
    const denominator = 10n ** BigInt(fraction.length + 1);
    return recipeStarTiers.map(({star, multiplierTenths}) => star === 1
        ? salePrice
        : ((units * multiplierTenths + denominator - 1n) / denominator).toString());
}
