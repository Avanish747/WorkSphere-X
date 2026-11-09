const express = require('express');
const { z } = require('zod');
const { Attendance, Employee, Shift, Leave, Company } = require('../models');
const { authenticate, authorize, requireTenantAccess } = require('../middleware/auth');
const { tenantFilter, assertTenantRelation } = require('../utils/tenant');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { writeAudit } = require('../utils/audit');
const { localDayBounds, getLocalDateParts } = require('../utils/time');

const router = express.Router();
const checkInSchema = z.object({
  employeeId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  companyId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  note: z.string().max(500).optional(),
});

function timeToMinutes(value) {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function minutesBetween(start, end) {
  return end >= start ? end - start : end + 1440 - start;
}

async function targetEmployee(req, companyId, requestedEmployeeId) {
  const employeeId = req.user.role === 'employee' ? req.user.employeeId : requestedEmployeeId;
  if (!employeeId) throw Object.assign(new Error('employeeId is required.'), { statusCode: 400 });
  const employee = await Employee.findOne({ _id: employeeId, companyId, status: 'active' });
  assertTenantRelation(companyId, employee, 'Employee');
  return employee;
}

router.get('/history', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'department_manager', 'employee'), async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query);
  const filter = tenantFilter(req.user, req.query.companyId);
  if (req.user.role === 'employee') filter.employeeId = req.user.employeeId || null;
  if (req.query.employeeId && req.user.role !== 'employee') filter.employeeId = req.query.employeeId;
  if (req.query.from || req.query.to) {
    filter.workDate = {};
    if (req.query.from) filter.workDate.$gte = new Date(req.query.from);
    if (req.query.to) filter.workDate.$lte = new Date(req.query.to);
  }
  if (req.query.status) filter.status = req.query.status;
  const [records, total] = await Promise.all([
    Attendance.find(filter).populate('employeeId', 'employeeCode firstName lastName').sort(sort).skip(skip).limit(limit).lean(),
    Attendance.countDocuments(filter),
  ]);
  return res.json(paginatedResponse(records, total, page, limit));
});

router.get('/calendar', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'department_manager', 'employee'), async (req, res) => {
  const year = Number(req.query.year) || new Date().getUTCFullYear();
  const month = Number(req.query.month) || new Date().getUTCMonth() + 1;
  if (!Number.isInteger(year) || month < 1 || month > 12) return res.status(400).json({ message: 'A valid year and month are required.' });
  const from = new Date(Date.UTC(year, month - 1, 1));
  const to = new Date(Date.UTC(year, month, 1));
  const filter = { ...tenantFilter(req.user, req.query.companyId), workDate: { $gte: from, $lt: to } };
  if (req.user.role === 'employee') filter.employeeId = req.user.employeeId || null;
  if (req.query.employeeId && req.user.role !== 'employee') filter.employeeId = req.query.employeeId;
  const [attendance, approvedLeave] = await Promise.all([
    Attendance.find(filter).populate('employeeId', 'employeeCode firstName lastName').sort({ workDate: 1 }).lean(),
    Leave.find({
      ...tenantFilter(req.user, req.query.companyId),
      status: 'approved',
      startDate: { $lt: to },
      endDate: { $gte: from },
      ...(req.user.role === 'employee' ? { employeeId: req.user.employeeId || null } : {}),
    }).populate('employeeId', 'employeeCode firstName lastName').lean(),
  ]);
  return res.json({ year, month, attendance, approvedLeave });
});

router.get('/reports', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'finance_manager'), async (req, res) => {
  const filter = tenantFilter(req.user, req.query.companyId);
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const to = req.query.to ? new Date(req.query.to) : new Date();
  const report = await Attendance.aggregate([
    { $match: { ...filter, workDate: { $gte: from, $lte: to } } },
    { $group: {
      _id: '$status',
      records: { $sum: 1 },
      workedMinutes: { $sum: '$workedMinutes' },
      overtimeMinutes: { $sum: '$overtimeMinutes' },
      lateMinutes: { $sum: '$lateMinutes' },
    } },
    { $sort: { _id: 1 } },
  ]);
  return res.json({ from, to, report });
});

router.post('/check-in', authenticate, requireTenantAccess, async (req, res) => {
  const input = checkInSchema.parse(req.body);
  const companyId = req.user.role === 'super_admin' ? input.companyId : req.user.companyId;
  if (!companyId) return res.status(400).json({ message: 'companyId is required.' });
  const employee = await targetEmployee(req, companyId, input.employeeId);
  const now = new Date();
  const company = await Company.findById(companyId).select('settings.timezone');
  const timeZone = company?.settings?.timezone || 'UTC';
  const { start, parts } = localDayBounds(now, timeZone);
  let shiftId = employee.shiftId;
  let lateMinutes = 0;
  if (shiftId) {
    const shift = await Shift.findOne({ _id: shiftId, companyId });
    if (!shift) shiftId = null;
    else {
      const currentMinute = parts.hour * 60 + parts.minute;
      lateMinutes = Math.max(currentMinute - timeToMinutes(shift.startTime) - shift.graceMinutes, 0);
    }
  }

  try {
    const attendance = await Attendance.create({
      companyId,
      employeeId: employee._id,
      shiftId,
      workDate: start,
      checkInAt: now,
      lateMinutes,
      status: lateMinutes > 0 ? 'late' : 'present',
      note: input.note,
    });
    await writeAudit(req, 'attendance.checked_in', 'Attendance', attendance._id);
    return res.status(201).json(attendance);
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'Attendance is already recorded for this employee today.' });
    throw error;
  }
});

router.post('/check-out', authenticate, requireTenantAccess, async (req, res) => {
  const input = checkInSchema.parse(req.body);
  const companyId = req.user.role === 'super_admin' ? input.companyId : req.user.companyId;
  if (!companyId) return res.status(400).json({ message: 'companyId is required.' });
  const employee = await targetEmployee(req, companyId, input.employeeId);
  const company = await Company.findById(companyId).select('settings.timezone settings.standardWorkdayHours');
  const timeZone = company?.settings?.timezone || 'UTC';
  const { start } = localDayBounds(new Date(), timeZone);
  const attendance = await Attendance.findOne({ companyId, employeeId: employee._id, workDate: start, checkOutAt: null });
  if (!attendance) return res.status(409).json({ message: 'No open check-in was found for this employee today.' });

  const now = new Date();
  if (now < attendance.checkInAt) return res.status(400).json({ message: 'Check-out cannot occur before check-in.' });
  const actualMinutes = Math.round((now - attendance.checkInAt) / 60000);
  const shift = attendance.shiftId ? await Shift.findOne({ _id: attendance.shiftId, companyId }) : null;
  const scheduledMinutes = shift ? minutesBetween(timeToMinutes(shift.startTime), timeToMinutes(shift.endTime)) : (company?.settings?.standardWorkdayHours || 8) * 60;
  const expectedEnd = shift ? timeToMinutes(shift.endTime) : timeToMinutes('17:00');
  const actualEndParts = getLocalDateParts(now, timeZone);
  const actualEnd = actualEndParts.hour * 60 + actualEndParts.minute;
  const earlyDepartureMinutes = Math.max(expectedEnd - actualEnd, 0);
  attendance.checkOutAt = now;
  attendance.workedMinutes = actualMinutes;
  attendance.overtimeMinutes = Math.max(actualMinutes - scheduledMinutes, 0);
  attendance.earlyDepartureMinutes = earlyDepartureMinutes;
  if (actualMinutes < scheduledMinutes / 2) attendance.status = 'half_day';
  await attendance.save();
  await writeAudit(req, 'attendance.checked_out', 'Attendance', attendance._id);
  return res.json(attendance);
});

module.exports = router;
