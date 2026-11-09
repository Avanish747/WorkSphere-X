const express = require('express');
const { z } = require('zod');
const { Leave, Employee, Expense, Payroll, Notification } = require('../models');
const { authenticate, authorize, requireTenantAccess } = require('../middleware/auth');
const { tenantFilter } = require('../utils/tenant');
const { parsePagination, paginatedResponse } = require('../utils/pagination');
const { releaseReservation } = require('./leaves');
const { writeAudit } = require('../utils/audit');

const router = express.Router();
const decisionSchema = z.object({
  action: z.enum(['approve', 'reject']),
  note: z.string().max(1000).optional(),
  companyId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
});

const workflowTypes = {
  leave: { Model: Leave, pendingStatus: 'pending', owner: 'employeeId', roles: ['hr_manager', 'department_manager', 'company_admin', 'super_admin'] },
  expense: { Model: Expense, pendingStatus: 'pending', owner: 'employeeId', roles: ['finance_manager', 'department_manager', 'company_admin', 'super_admin'] },
  payroll: { Model: Payroll, pendingStatus: 'pending_approval', owner: 'employeeId', roles: ['finance_manager', 'company_admin', 'super_admin'] },
};

async function approvalSteps(type, record) {
  if (type === 'payroll') return ['finance_manager', 'company_admin'];
  const employee = await Employee.findOne({ _id: record.employeeId, companyId: record.companyId }).select('managerId');
  const managerSteps = employee?.managerId ? ['department_manager'] : [];
  return type === 'leave'
    ? [...managerSteps, 'hr_manager']
    : [...managerSteps, 'finance_manager'];
}

async function isEligible(req, expectedRole, record) {
  if (req.user.role === 'super_admin' || req.user.role === 'company_admin') return true;
  if (req.user.role !== expectedRole) return false;
  if (expectedRole !== 'department_manager') return true;
  const employee = await Employee.findOne({ _id: record.employeeId, companyId: record.companyId }).select('managerId');
  return Boolean(employee?.managerId && String(employee.managerId) === String(req.user.employeeId));
}

router.get('/', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'department_manager', 'finance_manager', 'employee'), async (req, res) => {
  const type = req.query.type || 'all';
  if (!['all', 'leave', 'expense', 'payroll'].includes(type)) return res.status(400).json({ message: 'Invalid approval type.' });
  const allowedTypes = {
    super_admin: ['leave', 'expense', 'payroll'],
    company_admin: ['leave', 'expense', 'payroll'],
    hr_manager: ['leave', 'expense'],
    department_manager: ['leave', 'expense'],
    finance_manager: ['expense', 'payroll'],
    employee: ['leave'],
  }[req.user.role] || [];
  if (type !== 'all' && !allowedTypes.includes(type)) return res.status(403).json({ message: 'You cannot view this approval workflow.' });
  const { page, limit, skip } = parsePagination(req.query);
  const filter = tenantFilter(req.user, req.query.companyId);
  const requested = type === 'all' ? allowedTypes : [type];
  if (req.user.role === 'employee') filter.employeeId = req.user.employeeId || null;

  const results = await Promise.all(requested.map(async (kind) => {
    const config = workflowTypes[kind];
    const [records, total] = await Promise.all([
      config.Model.find({ ...filter, status: config.pendingStatus })
        .populate('employeeId', 'employeeCode firstName lastName')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      config.Model.countDocuments({ ...filter, status: config.pendingStatus }),
    ]);
    return { kind, records, total };
  }));
  const data = results.flatMap(({ kind, records }) => records.map((record) => ({ ...record, workflowType: kind })))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt));
  const total = results.reduce((sum, result) => sum + result.total, 0);
  return res.json(paginatedResponse(data.slice(skip, skip + limit), total, page, limit));
});

router.post('/:type/:id/decision', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'department_manager', 'finance_manager'), requireTenantAccess, async (req, res) => {
  const type = req.params.type;
  const config = workflowTypes[type];
  if (!config) return res.status(404).json({ message: 'Approval workflow not found.' });
  const input = decisionSchema.parse(req.body);
  const filter = { _id: req.params.id, ...tenantFilter(req.user, input.companyId), status: config.pendingStatus };
  const record = await config.Model.findOne(filter);
  if (!record) return res.status(404).json({ message: 'Pending approval was not found.' });
  if (req.user.employeeId && String(record[config.owner]) === String(req.user.employeeId)) {
    return res.status(403).json({ message: 'You cannot approve your own request.' });
  }

  const steps = await approvalSteps(type, record);
  const level = record.currentApprovalLevel || 0;
  const expectedRole = steps[level];
  if (!expectedRole) return res.status(409).json({ message: 'This approval is already complete.' });
  if (!(await isEligible(req, expectedRole, record))) {
    return res.status(403).json({ message: `This approval requires ${expectedRole.replace('_', ' ')} authorization.` });
  }
  const lastApproval = record.approvals?.[record.approvals.length - 1];
  if (lastApproval && String(lastApproval.approverId) === req.user.id) {
    return res.status(409).json({ message: 'A different approver must complete the next approval level.' });
  }

  const approved = input.action === 'approve';
  const finalLevel = !approved || level === steps.length - 1;
  const nextStatus = !approved
    ? 'rejected'
    : finalLevel
      ? 'approved'
      : config.pendingStatus;
  const update = {
    $set: {
      status: nextStatus,
      currentApprovalLevel: finalLevel ? level : level + 1,
    },
    $push: {
      approvals: {
        approverId: req.user.id,
        role: req.user.role,
        action: input.action,
        note: input.note,
        actedAt: new Date(),
      },
    },
  };
  const changed = await config.Model.findOneAndUpdate(
    { ...filter, currentApprovalLevel: level },
    update,
    { new: true, runValidators: true },
  );
  if (!changed) return res.status(409).json({ message: 'This approval was updated by another reviewer.' });

  try {
    if (type === 'leave' && finalLevel) {
      await releaseReservation(
        changed.companyId,
        changed.employeeId,
        changed.startDate.getUTCFullYear(),
        changed.category,
        changed.days,
        approved,
      );
    }
  } catch (error) {
    await config.Model.updateOne(
      { _id: changed._id, status: nextStatus, currentApprovalLevel: changed.currentApprovalLevel },
      {
        $set: { status: config.pendingStatus, currentApprovalLevel: level },
        $pull: { approvals: { approverId: req.user.id, actedAt: changed.approvals.at(-1)?.actedAt } },
      },
    );
    throw error;
  }

  const employee = await Employee.findOne({ _id: changed.employeeId, companyId: changed.companyId }).select('userId');
  if (finalLevel && employee?.userId) {
    await Notification.create({
      companyId: changed.companyId,
      userId: employee.userId,
      type: `${type}.${nextStatus}`,
      title: `${type[0].toUpperCase()}${type.slice(1)} ${nextStatus}`,
      message: `Your ${type} request has been ${nextStatus}.`,
      resourceType: type,
      resourceId: changed._id,
    });
  }
  if (!finalLevel) {
    const requiredRole = steps[level + 1];
    const approvers = await require('../models').User.find({
      companyId: changed.companyId,
      role: requiredRole,
      status: 'active',
    }).select('_id');
    if (approvers.length) {
      await Notification.insertMany(approvers.map((approver) => ({
        companyId: changed.companyId,
        userId: approver._id,
        type: `${type}.approval_required`,
        title: 'Another approval is required',
        message: `A ${type} request needs ${requiredRole.replace('_', ' ')} review.`,
        resourceType: type,
        resourceId: changed._id,
      })));
    }
  }
  const auditAction = input.action === 'approve' ? `${type}.approved` : `${type}.rejected`;
  await writeAudit(req, auditAction, type, changed._id, { note: input.note, level });
  return res.json({ message: finalLevel ? `Request ${nextStatus}.` : 'Approval recorded. Another level of review is required.', record: changed });
});

module.exports = router;
