/** Exact decimal-text fractions for bounded v4 condition arithmetic. */
export interface ParameterRational {numerator: bigint; denominator: bigint}
const maximumValue = 17976931348623157n * 10n ** 292n;
const absolute = (value: bigint) => value < 0n ? -value : value;
const bits = (value: bigint) => absolute(value).toString(2).length;
const gcd = (left: bigint, right: bigint): bigint => {
    left = absolute(left); right = absolute(right);
    while (right) [left, right] = [right, left % right];
    return left;
};
export function assertParameterArithmeticInput(value: number): void {
    if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error('条件算术输入必须是有限数值且绝对值不超过 9007199254740991');
}
function checked(numerator: bigint, denominator: bigint): ParameterRational {
    if (!denominator) throw new Error('条件算术不能除以零');
    const divisor = gcd(numerator, denominator), direction = denominator < 0n ? -1n : 1n;
    numerator = numerator / divisor * direction; denominator = denominator / divisor * direction;
    if (bits(numerator) > 4096 || bits(denominator) > 4096 || absolute(numerator) > maximumValue * denominator) throw new Error('条件算术超过数值或精度预算');
    return {numerator, denominator};
}
export function parameterRational(value: number): ParameterRational {
    assertParameterArithmeticInput(value);
    const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
    const scale = (mantissa.split('.')[1]?.length || 0) - Number(exponent);
    const coefficient = BigInt(mantissa.replace('.', ''));
    return checked(scale < 0 ? coefficient * 10n ** BigInt(-scale) : coefficient, scale > 0 ? 10n ** BigInt(scale) : 1n);
}
export function negateParameterRational(value: ParameterRational): ParameterRational {return checked(-value.numerator, value.denominator);}
export function calculateParameterRational(operator: 'add' | 'sub' | 'mul' | 'div', left: ParameterRational, right: ParameterRational): ParameterRational {
    if (operator === 'mul') return checked(left.numerator * right.numerator, left.denominator * right.denominator);
    if (operator === 'div') return checked(left.numerator * right.denominator, left.denominator * right.numerator);
    const rightSigned = (operator === 'sub' ? -1n : 1n) * right.numerator;
    return checked(left.numerator * right.denominator + rightSigned * left.denominator, left.denominator * right.denominator);
}
export function compareParameterRational(left: ParameterRational, right: ParameterRational): number {
    const difference = left.numerator * right.denominator - right.numerator * left.denominator;
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}
