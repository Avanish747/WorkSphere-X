const express = require('express');
const PDFDocument = require('pdfkit');
const { z } = require('zod');
const { Payroll, SalaryStructure, Employee, Attendance, Leave } = require('../models');
const { authenticate, authorize, requireTenantAccess } = require('../middleware/auth');
const { tenantFilter, assertTenantRelation } = require('../utils/tenant');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { calculatePayroll } = require('../services/payroll');
const { writeAudit } = require('../utils/audit');

const router = express.Router();

function countLeaveDaysInPeriod(leave, from, to) {
  const start = new Date(Math.max(leave.startDate.getTime(), from.getTime()));
  const end = new Date(Math.min(leave.endDate.getTime(), to.getTime() - 1));
  let count = 0;
  for (const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate())); date <= end; date.setUTCDate(date.getUTCDate() + 1)) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) count += 1;
  }
  return count;
}

const salarySchema = z.object({
  employeeId: z.string().regex(/^[a-f\d]{24}$/i),
  effectiveFrom: z.coerce.date(),
  basicMonthly: z.number().min(0).max(100000000),
  hraMonthly: z.number().min(0).max(100000000).default(0),
  allowancesMonthly: z.number().min(0).max(100000000).default(0),
  taxRate: z.number().min(0).max(1).default(0.1),
  overtimeMultiplier: z.number().min(1).max(5).default(1.5),
  currency: z.string().length(3).default('USD'),
});

router.get('/salary-structures', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'finance_manager'), async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query);
  const filter = tenantFilter(req.user, req.query.companyId);
  if (req.query.employeeId) filter.employeeId = req.query.employeeId;
  const [data, total] = await Promise.all([
    SalaryStructure.find(filter).populate('employeeId', 'employeeCode firstName lastName').sort(sort).skip(skip).limit(limit).lean(),
    SalaryStructure.countDocuments(filter),
  ]);
  return res.json(paginatedResponse(data, total, page, limit));
});

router.post('/salary-structures', authenticate, authorize('super_admin', 'company_admin', 'finance_manager'), requireTenantAccess, async (req, res) => {
  const input = salarySchema.parse(req.body);
  const companyId = req.user.role === 'super_admin' ? req.body.companyId : req.user.companyId;
  if (!companyId) return res.status(400).json({ message: 'companyId is required.' });
  const employee = await Employee.findOne({ _id: input.employeeId, companyId }).select('_id');
  assertTenantRelation(companyId, employee, 'Employee');
  await SalaryStructure.updateMany({ companyId, employeeId: employee._id, status: 'active' }, { status: 'superseded' });
  const structure = await SalaryStructure.create({ ...input, companyId, currency: input.currency.toUpperCase() });
  await writeAudit(req, 'salary_structure.created', 'SalaryStructure', structure._id);
  return res.status(201).json(structure);
});

router.get('/', authenticate, authorize('super_admin', 'company_admin', 'finance_manager', 'employee'), async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query);
  const filter = tenantFilter(req.user, req.query.companyId);
  if (req.user.role === 'employee') filter.employeeId = req.user.employeeId || null;
  else if (req.query.employeeId) filter.employeeId = req.query.employeeId;
  if (req.query.year) filter.periodYear = Number(req.query.year);
  if (req.query.month) filter.periodMonth = Number(req.query.month);
  if (req.query.status) filter.status = req.query.status;
  const [data, total] = await Promise.all([
    Payroll.find(filter).populate('employeeId', 'employeeCode firstName lastName').sort(sort).skip(skip).limit(limit).lean(),
    Payroll.countDocuments(filter),
  ]);
  return res.json(paginatedResponse(data, total, page, limit));
});

router.post('/generate', authenticate, authorize('super_admin', 'company_admin', 'finance_manager'), requireTenantAccess, async (req, res) => {
  const input = z.object({
    companyId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    year: z.number().int().min(2000).max(2200),
    month: z.number().int().min(1).max(12),
    bonus: z.number().min(0).max(100000000).default(0),
    employeeId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  }).parse(req.body);
  const companyId = req.user.role === 'super_admin' ? input.companyId : req.user.companyId;
  if (!companyId) return res.status(400).json({ message: 'companyId is required.' });

  const dateFrom = new Date(Date.UTC(input.year, input.month - 1, 1));
  const dateTo = new Date(Date.UTC(input.year, input.month, 1));
  const employeeFilter = { companyId, status: 'active' };
  if (input.employeeId) employeeFilter._id = input.employeeId;
  const employees = await Employee.find(employeeFilter).select('_id');
  const created = [];
  const skipped = [];

  for (const employee of employees) {
    const salary = await SalaryStructure.findOne({
      companyId,
      employeeId: employee._id,
      status: 'active',
      effectiveFrom: { $lt: dateTo },
    }).sort({ effectiveFrom: -1 });
    if (!salary) {
      skipped.push({ employeeId: String(employee._id), reason: 'Salary structure not configured.' });
      continue;
    }

    const [attendanceSummary, approvedLeaves] = await Promise.all([
      Attendance.aggregate([
        { $match: { companyId: salary.companyId, employeeId: employee._id, workDate: { $gte: dateFrom, $lt: dateTo } } },
        { $group: {
          _id: null,
          presentDays: { $sum: { $switch: {
            branches: [
              { case: { $in: ['$status', ['present', 'late']] }, then: 1 },
              { case: { $eq: ['$status', 'half_day'] }, then: 0.5 },
            ],
            default: 0,
          } } },
          overtimeMinutes: { $sum: '$overtimeMinutes' },
        } },
      ]),
      Leave.find({
        companyId: salary.companyId,
        employeeId: employee._id,
        status: 'approved',
        startDate: { $lt: dateTo },
        endDate: { $gte: dateFrom },
      }).select('category startDate endDate days').lean(),
    ]);

    const summary = attendanceSummary[0] || { presentDays: 0, overtimeMinutes: 0 };
    const unpaidDays = approvedLeaves
      .filter((leave) => leave.category === 'unpaid')
      .reduce((sum, leave) => sum + countLeaveDaysInPeriod(leave, dateFrom, dateTo), 0);
    const paidLeaveDays = approvedLeaves
      .filter((leave) => ['annual', 'sick', 'personal', 'parental'].includes(leave.category))
      .reduce((sum, leave) => sum + countLeaveDaysInPeriod(leave, dateFrom, dateTo), 0);
    const calculation = calculatePayroll({
      salary,
      year: input.year,
      month: input.month,
      attendance: summary,
      paidLeaveDays,
      unpaidLeaveDays: unpaidDays,
      bonus: input.bonus,
    });
    try {
      const payroll = await Payroll.create({
        companyId,
        employeeId: employee._id,
        periodYear: input.year,
        periodMonth: input.month,
        currency: salary.currency,
        ...calculation,
        generatedBy: req.user.id,
        status: 'pending_approval',
      });
      created.push(payroll);
    } catch (error) {
      if (error.code === 11000) {
        skipped.push({ employeeId: String(employee._id), reason: 'Payroll already exists for this period.' });
      } else {
        throw error;
      }
    }
  }

  await writeAudit(req, 'payroll.generated', 'Payroll', undefined, { year: input.year, month: input.month, created: created.length });
  return res.status(201).json({ created, skipped, period: { year: input.year, month: input.month } });
});

router.post('/:id/lock', authenticate, authorize('super_admin', 'company_admin', 'finance_manager'), requireTenantAccess, async (req, res) => {
  const filter = { _id: req.params.id, ...tenantFilter(req.user, req.body?.companyId), status: 'approved' };
  const payroll = await Payroll.findOneAndUpdate(filter, { $set: { status: 'locked', lockedAt: new Date() } }, { new: true });
  if (!payroll) return res.status(409).json({ message: 'Only approved payroll can be locked.' });
  await writeAudit(req, 'payroll.locked', 'Payroll', payroll._id);
  return res.json(payroll);
});

router.post('/:id/pay', authenticate, authorize('super_admin', 'company_admin', 'finance_manager'), requireTenantAccess, async (req, res) => {
  const filter = { _id: req.params.id, ...tenantFilter(req.user, req.body?.companyId), status: { $in: ['approved', 'locked'] } };
  const payroll = await Payroll.findOneAndUpdate(filter, { $set: { status: 'paid', paidAt: new Date() } }, { new: true });
  if (!payroll) return res.status(409).json({ message: 'Only approved or locked payroll can be marked paid.' });
  await writeAudit(req, 'payroll.paid', 'Payroll', payroll._id);
  return res.json(payroll);
});

router.get('/:id/payslip.pdf', authenticate, requireTenantAccess, async (req, res) => {
  const filter = { _id: req.params.id, ...tenantFilter(req.user, req.query.companyId) };
  if (req.user.role === 'employee') filter.employeeId = req.user.employeeId || null;
  else if (!['super_admin', 'company_admin', 'finance_manager'].includes(req.user.role)) {
    return res.status(403).json({ message: 'You cannot access payroll documents.' });
  }
  const payroll = await Payroll.findOne(filter).populate('employeeId', 'employeeCode firstName lastName email');
  if (!payroll) return res.status(404).json({ message: 'Payslip not found.' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="payslip-${payroll.periodYear}-${String(payroll.periodMonth).padStart(2, '0')}.pdf"`);
  const pdf = new PDFDocument({ size: 'A4', margin: 56 });
  pdf.pipe(res);
  pdf.fontSize(22).text('WorkSphere X', { align: 'center' });
  pdf.moveDown().fontSize(18).text('Payslip', { align: 'center' });
  pdf.moveDown().fontSize(11);
  pdf.text(`Employee: ${payroll.employeeId.firstName} ${payroll.employeeId.lastName} (${payroll.employeeId.employeeCode})`);
  pdf.text(`Period: ${payroll.periodYear}-${String(payroll.periodMonth).padStart(2, '0')}`);
  pdf.text(`Status: ${payroll.status}`);
  pdf.moveDown().text('Earnings');
  Object.entries(payroll.earnings.toObject()).forEach(([name, value]) => pdf.text(`${name}: ${payroll.currency} ${value.toFixed(2)}`));
  pdf.moveDown().text('Deductions');
  Object.entries(payroll.deductions.toObject()).forEach(([name, value]) => pdf.text(`${name}: ${payroll.currency} ${value.toFixed(2)}`));
  pdf.moveDown().fontSize(14).text(`Gross pay: ${payroll.currency} ${payroll.grossPay.toFixed(2)}`);
  pdf.text(`Net pay: ${payroll.currency} ${payroll.netPay.toFixed(2)}`);
  pdf.end();
});

module.exports = router;
