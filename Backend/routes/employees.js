const express = require('express');
const crypto = require('node:crypto');
const { z } = require('zod');
const { Employee, Department, Designation, Shift, Attendance, Leave, Payroll, Document, Subscription } = require('../models');
const { authenticate, authorize, requireTenantAccess } = require('../middleware/auth');
const { tenantFilter, assertTenantRelation } = require('../utils/tenant');
const { parsePagination, paginatedResponse, escapeRegex } = require('../utils/pagination');
const { writeAudit } = require('../utils/audit');

const router = express.Router();
const employeeInput = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().email().max(254),
  phone: z.string().trim().max(32).optional(),
  joinDate: z.coerce.date().optional(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern']).optional(),
  departmentId: z.string().regex(/^[a-f\d]{24}$/i).optional().nullable(),
  designationId: z.string().regex(/^[a-f\d]{24}$/i).optional().nullable(),
  managerId: z.string().regex(/^[a-f\d]{24}$/i).optional().nullable(),
  shiftId: z.string().regex(/^[a-f\d]{24}$/i).optional().nullable(),
  address: z.string().max(500).optional(),
});
const editableFields = [
  'firstName', 'lastName', 'email', 'phone', 'joinDate', 'employmentType',
  'departmentId', 'designationId', 'managerId', 'shiftId', 'address',
];

async function validateRelations(companyId, input, excludedEmployeeId) {
  for (const [field, Model, label] of [
    ['departmentId', Department, 'Department'],
    ['designationId', Designation, 'Designation'],
    ['shiftId', Shift, 'Shift'],
  ]) {
    if (!input[field]) continue;
    const record = await Model.findOne({ _id: input[field], companyId }).select('companyId');
    assertTenantRelation(companyId, record, label);
  }
  if (input.managerId) {
    const manager = await Employee.findOne({ _id: input.managerId, companyId })
      .select('companyId');
    assertTenantRelation(companyId, manager, 'Reporting manager');
    if (excludedEmployeeId && String(input.managerId) === String(excludedEmployeeId)) {
      return Promise.reject(Object.assign(new Error('An employee cannot report to themselves.'), { statusCode: 400 }));
    }
  }
}

function csvCell(value) {
  let safe = value == null ? '' : String(value);
  if (/^[=+\-@]/.test(safe)) safe = `'${safe}`;
  return `"${safe.replace(/"/g, '""')}"`;
}

router.get('/export.csv', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'department_manager', 'employee'), async (req, res) => {
  const filter = tenantFilter(req.user, req.query.companyId);
  if (req.user.role === 'employee') filter._id = req.user.employeeId || null;
  const rows = await Employee.find(filter)
    .populate('departmentId', 'name')
    .populate('designationId', 'title')
    .sort({ lastName: 1, firstName: 1 })
    .limit(10000)
    .lean();
  const header = ['Employee ID', 'First name', 'Last name', 'Email', 'Department', 'Designation', 'Status', 'Join date'];
  const lines = rows.map((employee) => [
    employee.employeeCode,
    employee.firstName,
    employee.lastName,
    employee.email,
    employee.departmentId?.name,
    employee.designationId?.title,
    employee.status,
    employee.joinDate?.toISOString().slice(0, 10),
  ].map(csvCell).join(','));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="employees.csv"');
  return res.send([header.map(csvCell).join(','), ...lines].join('\r\n'));
});

router.get('/', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'department_manager', 'employee'), async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query);
  const filter = tenantFilter(req.user, req.query.companyId);
  if (req.user.role === 'employee') {
    if (!req.user.employeeId) return res.json(paginatedResponse([], 0, page, limit));
    filter._id = req.user.employeeId;
  }
  if (req.query.status) filter.status = req.query.status;
  if (req.query.departmentId) filter.departmentId = req.query.departmentId;
  if (req.query.designationId) filter.designationId = req.query.designationId;
  if (req.query.q) {
    const search = escapeRegex(req.query.q.trim().slice(0, 100));
    filter.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { employeeCode: { $regex: search, $options: 'i' } },
    ];
  }

  const [employees, total] = await Promise.all([
    Employee.find(filter)
      .populate('departmentId', 'name')
      .populate('designationId', 'title')
      .populate('managerId', 'firstName lastName employeeCode')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Employee.countDocuments(filter),
  ]);
  return res.json(paginatedResponse(employees, total, page, limit));
});

router.post('/', authenticate, authorize('super_admin', 'company_admin', 'hr_manager'), requireTenantAccess, async (req, res) => {
  const input = employeeInput.parse(req.body);
  const companyId = req.user.role === 'super_admin' ? req.body.companyId : req.user.companyId;
  if (!companyId) return res.status(400).json({ message: 'companyId is required for platform admin requests.' });
  await validateRelations(companyId, input);
  const subscription = await Subscription.findOne({ companyId }).select('seatLimit status');
  if (subscription && subscription.status === 'active') {
    const activeCount = await Employee.countDocuments({ companyId, status: 'active' });
    if (activeCount >= subscription.seatLimit) {
      return res.status(409).json({ message: 'This workspace has reached its employee seat limit.' });
    }
  }

  const employee = await Employee.create({
    ...input,
    companyId,
    email: input.email.toLowerCase(),
    employeeCode: `WSX-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
  });
  await writeAudit(req, 'employee.created', 'Employee', employee._id);
  return res.status(201).json(employee);
});

router.get('/:id/profile', authenticate, requireTenantAccess, async (req, res) => {
  const filter = { _id: req.params.id, ...tenantFilter(req.user, req.query.companyId) };
  if (req.user.role === 'employee') filter._id = req.user.employeeId;
  const employee = await Employee.findOne(filter)
    .populate('departmentId', 'name')
    .populate('designationId', 'title level')
    .populate('managerId', 'firstName lastName email')
    .populate('shiftId', 'name startTime endTime');
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });

  const companyId = employee.companyId;
  const [attendance, leaves, payroll, documents] = await Promise.all([
    Attendance.find({ companyId, employeeId: employee._id }).sort({ workDate: -1 }).limit(10).lean(),
    Leave.find({ companyId, employeeId: employee._id }).sort({ createdAt: -1 }).limit(10).lean(),
    Payroll.find({ companyId, employeeId: employee._id }).sort({ periodYear: -1, periodMonth: -1 }).limit(6).lean(),
    Document.find({ companyId, employeeId: employee._id }).select('-storageKey').sort({ createdAt: -1 }).lean(),
  ]);
  return res.json({ employee, attendance, leaves, payroll, documents });
});

router.get('/:id', authenticate, requireTenantAccess, async (req, res) => {
  const filter = { _id: req.params.id, ...tenantFilter(req.user, req.query.companyId) };
  if (req.user.role === 'employee') filter._id = req.user.employeeId;
  const employee = await Employee.findOne(filter)
    .populate('departmentId', 'name')
    .populate('designationId', 'title')
    .populate('managerId', 'firstName lastName employeeCode')
    .populate('shiftId', 'name startTime endTime');
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });
  return res.json(employee);
});

router.put('/:id', authenticate, authorize('super_admin', 'company_admin', 'hr_manager'), requireTenantAccess, async (req, res) => {
  const input = employeeInput.partial().parse(req.body);
  const filter = { _id: req.params.id, ...tenantFilter(req.user, req.body.companyId) };
  const current = await Employee.findOne(filter);
  if (!current) return res.status(404).json({ message: 'Employee not found.' });
  await validateRelations(current.companyId, input, current._id);
  const update = Object.fromEntries(editableFields.filter((field) => input[field] !== undefined).map((field) => [field, input[field]]));
  const employee = await Employee.findOneAndUpdate(filter, update, { new: true, runValidators: true })
    .populate('departmentId', 'name')
    .populate('designationId', 'title');
  await writeAudit(req, 'employee.updated', 'Employee', employee._id, { fields: Object.keys(update) });
  return res.json(employee);
});

router.patch('/:id/deactivate', authenticate, authorize('super_admin', 'company_admin', 'hr_manager'), requireTenantAccess, async (req, res) => {
  const filter = { _id: req.params.id, ...tenantFilter(req.user, req.body.companyId) };
  const employee = await Employee.findOneAndUpdate(filter, { status: 'inactive', exitDate: new Date() }, { new: true, runValidators: true });
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });
  await writeAudit(req, 'employee.deactivated', 'Employee', employee._id);
  return res.json({ message: 'Employee deactivated.', employee });
});

router.delete('/:id', authenticate, authorize('super_admin', 'company_admin', 'hr_manager'), requireTenantAccess, async (req, res) => {
  const filter = { _id: req.params.id, ...tenantFilter(req.user, req.body.companyId) };
  const employee = await Employee.findOneAndUpdate(filter, { status: 'inactive', exitDate: new Date() }, { new: true, runValidators: true });
  if (!employee) return res.status(404).json({ message: 'Employee not found.' });
  await writeAudit(req, 'employee.deactivated', 'Employee', employee._id);
  return res.json({ message: 'Employee deactivated.', employee });
});

module.exports = router;
