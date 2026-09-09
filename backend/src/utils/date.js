// "YYYY-MM" -> 该月的 [start, end) UTC 区间，end 取下个月1号（不含），配合 Prisma 的 gte/lt 用
export function monthRange(month) {
  const [year, monthNum] = month.split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNum - 1, 1));
  const end = new Date(Date.UTC(year, monthNum, 1));
  return { start, end };
}
