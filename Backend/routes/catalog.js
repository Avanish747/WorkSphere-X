const express = require('express');
const multer = require('multer');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { z } = require('zod');
const {
  Company, User, Employee, Department, Designation, Shift, Asset, Project, Task,
  Performance, Expense, Document, Notification, AuditLog, Subscription,
} = require('../models');
const { authenticate, authorize, requireTenantAccess } = require('../middleware/auth');
const { tenantFilter, assertTenantRelation } = require('../utils/tenant');
const { parsePagination, paginatedResponse, escapeRegex } = require('../utils/pagination');
const { writeAudit } = require('../utils/audit');

const router = express.Router();
const uploadDirectory = path.resolve(process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads'));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter(req, file, callback) {
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)) {
      return callback(new Error('Only PDF, JPEG, or PNG files are accepted.'));
    }
    return callback(null, true);
  },
});

const definitions = {
  departments: {
    Model: Department,
    roles: ['super_admin', 'company_admin', 'hr_manager'],
    schema: z.object({ name: z.string().trim().min(2).max(80), code: z.string().trim().max(20).optional(), managerId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(), description: z.string().max(500).optional() }),
    search: ['name', 'code'],
  },
  designations: {
    Model: Designation,
    roles: ['super_admin', 'company_admin', 'hr_manager'],
    schema: z.object({ departmentId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(), title: z.string().trim().min(2).max(100), level: z.string().max(40).optional(), description: z.string().max(500).optional() }),
    search: ['title', 'level'],
  },
  shifts: {
    Model: Shift,
    roles: ['super_admin', 'company_admin', 'hr_manager'],
    schema: z.object({
      name: z.string().trim().min(2).max(80),
      startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      graceMinutes: z.number().int().min(0).max(180).optional(),
      workDays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
    }),
    search: ['name'],
  },
  assets: {
    Model: Asset,
    roles: ['super_admin', 'company_admin', 'hr_manager', 'employee'],
    schema: z.object({
      assetTag: z.string().trim().min(1).max(50),
      name: z.string().trim().min(2).max(120),
      category: z.string().max(60).optional(),
      serialNumber: z.string().max(120).optional(),
      assignedTo: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
      purchaseDate: z.coerce.date().optional(),
      status: z.enum(['available', 'assigned', 'maintenance', 'retired']).optional(),
    }),
    search: ['assetTag', 'name', 'serialNumber'],
  },
  projects: {
    Model: Project,
    roles: ['super_admin', 'company_admin', 'hr_manager', 'department_manager'],
    schema: z.object({
      name: z.string().trim().min(2).max(120),
      description: z.string().max(3000).optional(),
      ownerId: z.string().regex(/^[a-f\d]{24}$/i),
      memberIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(200).optional(),
      startsAt: z.coerce.date().optional(),
      endsAt: z.coerce.date().optional(),
      status: z.enum(['planning', 'active', 'completed', 'archived']).optional(),
    }),
    search: ['name'],
  },
  tasks: {
    Model: Task,
    roles: ['super_admin', 'company_admin', 'hr_manager', 'department_manager', 'employee'],
    schema: z.object({
      projectId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
      title: z.string().trim().min(2).max(200),
      description: z.string().max(5000).optional(),
      assigneeId: z.string().regex(/^[a-f\d]{24}$/i).nullable().optional(),
      dueAt: z.coerce.date().optional(),
      priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
      status: z.enum(['todo', 'in_progress', 'blocked', 'done']).optional(),
    }),
    search: ['title', 'description'],
  },
  performance: {
    Model: Performance,
    roles: ['super_admin', 'company_admin', 'hr_manager', 'department_manager', 'employee'],
    schema: z.object({
      employeeId: z.string().regex(/^[a-f\d]{24}$/i),
      periodStart: z.coerce.date(),
      periodEnd: z.coerce.date(),
      rating: z.number().min(1).max(5),
      goals: z.array(z.object({ title: z.string().max(200), progress: z.number().min(0).max(100).optional(), note: z.string().max(500).optional() })).max(50).optional(),
      feedback: z.string().max(5000).optional(),
    }),
    search: ['feedback'],
  },
  expenses: {
    Model: Expense,
    roles: ['super_admin', 'company_admin', 'hr_manager', 'finance_manager', 'department_manager', 'employee'],
    schema: z.object({
      employeeId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
      category: z.string().trim().min(2).max(80),
      amount: z.number().positive().max(100000000),
      currency: z.string().length(3).optional(),
      incurredAt: z.coerce.date(),
      description: z.string().trim().min(3).max(1500),
    }),
    search: ['category', 'description'],
  },
};

async function validateRelations(collection, companyId, input) {
  const checkEmployee = async (id, label = 'Employee') => {
    if (!id) return;
    const employee = await Employee.findOne({ _id: id, companyId }).select('companyId');
    assertTenantRelation(companyId, employee, label);
  };
  if (collection === 'departments') await checkEmployee(input.managerId, 'Department manager');
  if (collection === 'designations' && input.departmentId) {
    const department = await Department.findOne({ _id: input.departmentId, companyId }).select('companyId');
    assertTenantRelation(companyId, department, 'Department');
  }
  if (collection === 'assets') await checkEmployee(input.assignedTo);
  if (collection === 'projects') {
    await checkEmployee(input.ownerId, 'Project owner');
    for (const id of input.memberIds || []) await checkEmployee(id, 'Project member');
  }
  if (collection === 'tasks') {
    await checkEmployee(input.assigneeId, 'Task assignee');
    if (input.projectId) {
      const project = await Project.findOne({ _id: input.projectId, companyId }).select('companyId');
      assertTenantRelation(companyId, project, 'Project');
    }
  }
  if (collection === 'performance') await checkEmployee(input.employeeId);
  if (collection === 'expenses') await checkEmployee(input.employeeId || null);
}

for (const [collection, definition] of Object.entries(definitions)) {
  router.get(`/${collection}`, authenticate, authorize(...definition.roles), async (req, res) => {
    const { page, limit, skip, sort } = parsePagination(req.query);
    const filter = tenantFilter(req.user, req.query.companyId);
    if (req.user.role === 'employee') {
      if (collection === 'assets') filter.assignedTo = req.user.employeeId || null;
      else if (collection === 'tasks') filter.assigneeId = req.user.employeeId || null;
      else if (collection === 'performance') filter.employeeId = req.user.employeeId || null;
      else if (collection === 'expenses') filter.employeeId = req.user.employeeId || null;
    }
    if (req.query.status && definition.Model.schema.path('status')) filter.status = req.query.status;
    if (req.query.q && definition.search.length) {
      const search = escapeRegex(req.query.q.trim().slice(0, 100));
      filter.$or = definition.search.map((field) => ({ [field]: { $regex: search, $options: 'i' } }));
    }
    const [data, total] = await Promise.all([
      definition.Model.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      definition.Model.countDocuments(filter),
    ]);
    return res.json(paginatedResponse(data, total, page, limit));
  });

  router.post(`/${collection}`, authenticate, authorize(...definition.roles), requireTenantAccess, async (req, res) => {
    const input = definition.schema.parse(req.body);
    const companyId = req.user.role === 'super_admin' ? req.body.companyId : req.user.companyId;
    if (!companyId) return res.status(400).json({ message: 'companyId is required.' });
    if (req.user.role === 'employee' && ['expenses'].includes(collection)) input.employeeId = req.user.employeeId;
    if (req.user.role === 'employee' && ['tasks'].includes(collection)) input.assigneeId = req.user.employeeId;
    if (req.user.role === 'employee' && collection === 'performance') input.employeeId = req.user.employeeId;
    if (collection === 'expenses' && !input.employeeId) return res.status(400).json({ message: 'employeeId is required.' });
    await validateRelations(collection, companyId, input);
    const data = await definition.Model.create({
      ...input,
      companyId,
      ...(collection === 'performance' && { reviewerId: req.user.id }),
    });
    await writeAudit(req, `${collection}.created`, collection, data._id);
    return res.status(201).json(data);
  });

  router.put(`/${collection}/:id`, authenticate, authorize(...definition.roles.filter((role) => role !== 'employee')), requireTenantAccess, async (req, res) => {
    const input = definition.schema.partial().parse(req.body);
    const companyId = req.user.role === 'super_admin' ? req.body.companyId : req.user.companyId;
    if (!companyId) return res.status(400).json({ message: 'companyId is required.' });
    await validateRelations(collection, companyId, input);
    const data = await definition.Model.findOneAndUpdate(
      { _id: req.params.id, companyId },
      input,
      { new: true, runValidators: true },
    );
    if (!data) return res.status(404).json({ message: `${collection.slice(0, -1)} not found.` });
    await writeAudit(req, `${collection}.updated`, collection, data._id, { fields: Object.keys(input) });
    return res.json(data);
  });
}

router.get('/companies/me', authenticate, async (req, res) => {
  if (!req.user.companyId) return res.status(404).json({ message: 'No company workspace is assigned.' });
  const company = await Company.findById(req.user.companyId).lean();
  if (!company) return res.status(404).json({ message: 'Company not found.' });
  return res.json(company);
});

router.patch('/companies/me', authenticate, authorize('company_admin'), async (req, res) => {
  const input = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    industry: z.string().trim().max(80).optional(),
    phone: z.string().max(32).optional(),
    location: z.string().max(160).optional(),
    settings: z.object({
      timezone: z.string().max(80).optional(),
      currency: z.string().length(3).optional(),
      attendanceGraceMinutes: z.number().int().min(0).max(180).optional(),
      standardWorkdayHours: z.number().min(1).max(24).optional(),
      taxRate: z.number().min(0).max(1).optional(),
    }).optional(),
  }).parse(req.body);
  const update = {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'settings') {
      for (const [setting, settingValue] of Object.entries(value)) update[`settings.${setting}`] = settingValue;
    } else {
      update[key] = value;
    }
  }
  const company = await Company.findByIdAndUpdate(
    req.user.companyId,
    { $set: update },
    { new: true, runValidators: true },
  );
  await writeAudit(req, 'company.settings_updated', 'Company', company._id);
  return res.json(company);
});

router.post('/documents/upload', authenticate, requireTenantAccess, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'A file is required.' });
  const signatures = {
    'application/pdf': req.file.buffer.subarray(0, 5).toString() === '%PDF-',
    'image/png': req.file.buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    'image/jpeg': req.file.buffer[0] === 0xff && req.file.buffer[1] === 0xd8 && req.file.buffer[2] === 0xff,
  };
  if (!signatures[req.file.mimetype]) return res.status(400).json({ message: 'File content does not match the allowed file type.' });
  const input = z.object({
    employeeId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
    category: z.enum(['resume', 'identity', 'contract', 'certificate', 'other']).default('other'),
  }).parse(req.body);
  const companyId = req.user.role === 'super_admin' ? req.body.companyId : req.user.companyId;
  if (!companyId) return res.status(400).json({ message: 'companyId is required.' });
  const employeeId = req.user.role === 'employee' ? req.user.employeeId : input.employeeId;
  if (employeeId) {
    const employee = await Employee.findOne({ _id: employeeId, companyId }).select('_id');
    assertTenantRelation(companyId, employee, 'Employee');
  }
  const extension = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[req.file.mimetype];
  const storageKey = `${crypto.randomUUID()}${extension}`;
  await fs.mkdir(uploadDirectory, { recursive: true });
  const filePath = path.join(uploadDirectory, storageKey);
  await fs.writeFile(filePath, req.file.buffer, { flag: 'wx', mode: 0o600 });
  try {
    const document = await Document.create({
      companyId,
      employeeId: employeeId || null,
      uploadedBy: req.user.id,
      name: path.basename(req.file.originalname).slice(0, 255),
      storageKey,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
      category: input.category,
    });
    if (employeeId) await Employee.updateOne({ _id: employeeId, companyId }, { $addToSet: { documentIds: document._id } });
    await writeAudit(req, 'document.uploaded', 'Document', document._id, { sizeBytes: req.file.size });
    return res.status(201).json({ document: { ...document.toObject(), storageKey: undefined } });
  } catch (error) {
    await fs.unlink(filePath).catch((cleanupError) => console.error('Unable to remove uncommitted upload:', cleanupError.message));
    throw error;
  }
});

router.get('/documents/:id/download', authenticate, requireTenantAccess, async (req, res) => {
  const filter = {
    _id: req.params.id,
    ...tenantFilter(req.user, req.query.companyId),
  };
  if (req.user.role === 'employee') filter.employeeId = req.user.employeeId || null;
  const document = await Document.findOne(filter).select('+storageKey');
  if (!document) return res.status(404).json({ message: 'Document not found.' });
  const filePath = path.resolve(uploadDirectory, document.storageKey);
  const relativePath = path.relative(uploadDirectory, filePath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return res.status(400).json({ message: 'Invalid document path.' });
  const content = await fs.readFile(filePath);
  res.setHeader('Content-Type', document.mimeType);
  res.setHeader('Content-Length', content.length);
  res.setHeader('Content-Disposition', `attachment; filename="${document._id}${path.extname(document.storageKey)}"`);
  return res.send(content);
});

router.get('/documents', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'department_manager', 'employee'), async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = tenantFilter(req.user, req.query.companyId);
  if (req.user.role === 'employee') filter.employeeId = req.user.employeeId || null;
  else if (req.query.employeeId) filter.employeeId = req.query.employeeId;
  const [data, total] = await Promise.all([
    Document.find(filter).select('-storageKey').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Document.countDocuments(filter),
  ]);
  return res.json(paginatedResponse(data, total, page, limit));
});

router.patch('/documents/:id/decision', authenticate, authorize('super_admin', 'company_admin', 'hr_manager'), requireTenantAccess, async (req, res) => {
  const { status } = z.object({ status: z.enum(['approved', 'rejected']) }).parse(req.body);
  const document = await Document.findOneAndUpdate(
    { _id: req.params.id, ...tenantFilter(req.user, req.body.companyId), status: 'pending' },
    { $set: { status } },
    { new: true },
  ).select('-storageKey');
  if (!document) return res.status(404).json({ message: 'Pending document not found.' });
  await writeAudit(req, `document.${status}`, 'Document', document._id);
  return res.json(document);
});

router.get('/notifications', authenticate, async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = { ...tenantFilter(req.user, req.query.companyId), userId: req.user.id };
  if (req.query.unread === 'true') filter.readAt = null;
  const [data, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Notification.countDocuments(filter),
  ]);
  return res.json(paginatedResponse(data, total, page, limit));
});

router.patch('/notifications/:id/read', authenticate, async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, ...tenantFilter(req.user, req.body?.companyId), userId: req.user.id, readAt: null },
    { $set: { readAt: new Date() } },
    { new: true },
  );
  if (!notification) return res.status(404).json({ message: 'Unread notification not found.' });
  return res.json(notification);
});

router.get('/audit-logs', authenticate, authorize('super_admin', 'company_admin', 'hr_manager'), async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const filter = tenantFilter(req.user, req.query.companyId);
  const [data, total] = await Promise.all([
    AuditLog.find(filter).populate('actorId', 'fullName email').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  return res.json(paginatedResponse(data, total, page, limit));
});

router.get('/subscription', authenticate, async (req, res) => {
  const companyId = req.user.role === 'super_admin' ? req.query.companyId : req.user.companyId;
  if (!companyId) return res.status(400).json({ message: 'companyId is required.' });
  const subscription = await Subscription.findOne({ companyId }).select('-providerCustomerId -providerSubscriptionId');
  if (!subscription) return res.status(404).json({ message: 'Subscription not found.' });
  return res.json(subscription);
});

module.exports = router;
