const express = require('express');
const { z } = require('zod');
const { Leave, LeaveBalance, Employee, User, Notification } = require('../models');
const { authenticate, authorize, requireTenantAccess } = require('../middleware/auth');
const { tenantFilter, assertTenantRelation } = require('../utils/tenant');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { writeAudit } = require('../utils/audit');

const router = express.Router();
const leaveSchema = z.object({
  employeeId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  companyId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  category: z.enum(['annual', 'sick', 'personal', 'parental', 'unpaid', 'other']),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().trim().min(5).max(1000),
});

function dateOnly(value) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function workingDays(startDate, endDate) {
  let count = 0;
  for (const date = new Date(startDate); date <= endDate; date.setUTCDate(date.getUTCDate() + 1)) {
    if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) count += 1;
  }
  return count;
}

async function getBalance(companyId, employeeId, year) {
  return LeaveBalance.findOneAndUpdate(
    { companyId, employeeId, year },
    { $setOnInsert: { companyId, employeeId, year } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function reserveBalance(companyId, employeeId, year, category, days) {
  const balance = await getBalance(companyId, employeeId, year);
  const values = balance.categories[category];
  if (!values) throw Object.assign(new Error(`No ${category} balance is configured.`), { statusCode: 409 });
  const path = `categories.${category}`;
  const reserved = await LeaveBalance.findOneAndUpdate(
    {
      _id: balance._id,
      [`${path}.total`]: { $gte: values.used + values.reserved + days },
      [`${path}.used`]: values.used,
      [`${path}.reserved`]: values.reserved,
    },
    { $inc: { [`${path}.reserved`]: days } },
    { new: true },
  );
  if (!reserved) throw Object.assign(new Error('Insufficient leave balance.'), { statusCode: 409 });
  return reserved;
}

async function releaseReservation(companyId, employeeId, year, category, days, approved) {
  if (category === 'unpaid' || category === 'other') return;
  const path = `categories.${category}`;
  const inc = { [`${path}.reserved`]: -days };
  if (approved) inc[`${path}.used`] = days;
  const result = await LeaveBalance.updateOne(
    { companyId, employeeId, year, [`${path}.reserved`]: { $gte: days } },
    { $inc: inc },
  );
  if (result.modifiedCount !== 1) {
    throw Object.assign(new Error('Leave balance reservation could not be reconciled.'), { statusCode: 409 });
  }
}

router.get('/balance', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'department_manager', 'employee'), async (req, res) => {
  const companyId = req.user.role === 'super_admin' ? req.query.companyId : req.user.companyId;
  const employeeId = req.user.role === 'employee' ? req.user.employeeId : req.query.employeeId;
  if (!companyId || !employeeId) return res.status(400).json({ message: 'companyId and employeeId are required.' });
  const employee = await Employee.findOne({ _id: employeeId, companyId }).select('_id');
  assertTenantRelation(companyId, employee, 'Employee');
  const year = Number(req.query.year) || new Date().getUTCFullYear();
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return res.status(400).json({ message: 'Invalid leave year.' });
  const balance = await getBalance(companyId, employeeId, year);
  return res.json(balance);
});

router.get('/', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'department_manager', 'employee'), async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query);
  const filter = tenantFilter(req.user, req.query.companyId);
  if (req.user.role === 'employee') filter.employeeId = req.user.employeeId || null;
  else if (req.query.employeeId) filter.employeeId = req.query.employeeId;
  if (req.query.status) filter.status = req.query.status;
  const [leaves, total] = await Promise.all([
    Leave.find(filter).populate('employeeId', 'employeeCode firstName lastName').sort(sort).skip(skip).limit(limit).lean(),
    Leave.countDocuments(filter),
  ]);
  return res.json(paginatedResponse(leaves, total, page, limit));
});

router.post('/', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'department_manager', 'employee'), requireTenantAccess, async (req, res) => {
  const input = leaveSchema.parse(req.body);
  const companyId = req.user.role === 'super_admin' ? input.companyId : req.user.companyId;
  const employeeId = req.user.role === 'employee' ? req.user.employeeId : input.employeeId;
  if (!companyId || !employeeId) return res.status(400).json({ message: 'Employee and company are required.' });

  const employee = await Employee.findOne({ _id: employeeId, companyId, status: 'active' }).select('_id managerId');
  assertTenantRelation(companyId, employee, 'Employee');
  const startDate = dateOnly(input.startDate);
  const endDate = dateOnly(input.endDate);
  if (endDate < startDate) return res.status(400).json({ message: 'End date must be on or after the start date.' });
  if (startDate.getUTCFullYear() !== endDate.getUTCFullYear()) {
    return res.status(400).json({ message: 'A leave request must be within one calendar year.' });
  }
  const days = workingDays(startDate, endDate);
  if (days < 1 || days > 260) return res.status(400).json({ message: 'Leave dates must include at least one weekday.' });

  const overlap = await Leave.exists({
    companyId,
    employeeId,
    status: { $in: ['pending', 'approved'] },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
  });
  if (overlap) return res.status(409).json({ message: 'This request overlaps an existing pending or approved leave.' });

  const year = startDate.getUTCFullYear();
  if (!['unpaid', 'other'].includes(input.category)) {
    await reserveBalance(companyId, employeeId, year, input.category, days);
  }

  let leave;
  try {
    leave = await Leave.create({
      companyId,
      employeeId,
      category: input.category,
      startDate,
      endDate,
      days,
      reason: input.reason,
    });
  } catch (error) {
    if (!['unpaid', 'other'].includes(input.category)) {
      await LeaveBalance.updateOne(
        { companyId, employeeId, year },
        { $inc: { [`categories.${input.category}.reserved`]: -days } },
      );
    }
    throw error;
  }

  const approverIds = new Set();
  if (employee.managerId) {
    const manager = await Employee.findOne({ _id: employee.managerId, companyId }).select('userId');
    if (manager?.userId) approverIds.add(String(manager.userId));
  }
  const hrUsers = await User.find({ companyId, role: { $in: ['hr_manager', 'company_admin'] }, status: 'active' }).select('_id');
  hrUsers.forEach((user) => approverIds.add(String(user._id)));
  if (approverIds.size) {
    await Notification.insertMany([...approverIds].map((userId) => ({
      companyId,
      userId,
      type: 'leave.approval_required',
      title: 'Leave request needs review',
      message: `${days} day(s) of ${input.category} leave are awaiting approval.`,
      resourceType: 'Leave',
      resourceId: leave._id,
    })));
  }
  await writeAudit(req, 'leave.requested', 'Leave', leave._id, { days, category: input.category });
  return res.status(201).json(leave);
});

router.patch('/:id/cancel', authenticate, requireTenantAccess, async (req, res) => {
  const filter = { _id: req.params.id, ...tenantFilter(req.user, req.body?.companyId), status: 'pending' };
  if (req.user.role === 'employee') filter.employeeId = req.user.employeeId;
  else if (!['super_admin', 'company_admin', 'hr_manager'].includes(req.user.role)) {
    return res.status(403).json({ message: 'You cannot cancel this leave request.' });
  }
  const leave = await Leave.findOneAndUpdate(filter, { status: 'cancelled' }, { new: true });
  if (!leave) return res.status(404).json({ message: 'Pending leave request not found.' });
  await releaseReservation(leave.companyId, leave.employeeId, leave.startDate.getUTCFullYear(), leave.category, leave.days, false);
  await writeAudit(req, 'leave.cancelled', 'Leave', leave._id);
  return res.json(leave);
});

module.exports = router;
module.exports.releaseReservation = releaseReservation;
