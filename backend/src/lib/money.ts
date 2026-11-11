/** Round to paise (2 dp) avoiding binary float drift */
export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const sum = (xs: number[]) => r2(xs.reduce((a, b) => a + b, 0));
