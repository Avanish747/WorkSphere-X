function countWorkingDays(year, month) {
  const date = new Date(Date.UTC(year, month - 1, 1));
  let count = 0;
  while (date.getUTCMonth() === month - 1) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) count += 1;
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return count;
}

function calculatePayroll({ salary, year, month, attendance, paidLeaveDays = 0, unpaidLeaveDays = 0, bonus = 0 }) {
  const scheduledDays = countWorkingDays(year, month);
  const paidDays = Math.min(Math.max(attendance.presentDays + paidLeaveDays, 0), Math.max(scheduledDays - unpaidLeaveDays, 0));
  const ratio = scheduledDays ? paidDays / scheduledDays : 0;
  const basic = roundMoney(salary.basicMonthly * ratio);
  const hra = roundMoney(salary.hraMonthly * ratio);
  const allowances = roundMoney(salary.allowancesMonthly * ratio);
  const overtimeHours = Math.max(attendance.overtimeMinutes, 0) / 60;
  const standardWorkdayHours = 8;
  const overtime = roundMoney(
    (salary.basicMonthly / (scheduledDays * standardWorkdayHours))
      * overtimeHours
      * (salary.overtimeMultiplier || 1.5),
  );
  const safeBonus = roundMoney(Math.max(bonus, 0));
  const grossPay = roundMoney(basic + hra + allowances + overtime + safeBonus);
  const tax = roundMoney(grossPay * salary.taxRate);

  return {
    scheduledDays,
    paidDays,
    unpaidLeaveDays,
    earnings: { basic, hra, allowances, bonus: safeBonus, overtime },
    deductions: { tax, unpaidLeave: 0, other: 0 },
    grossPay,
    netPay: roundMoney(Math.max(grossPay - tax, 0)),
  };
}

function roundMoney(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

module.exports = { calculatePayroll, countWorkingDays, roundMoney };
