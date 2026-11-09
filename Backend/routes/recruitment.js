const express = require('express');
const { z } = require('zod');
const { Job, Candidate, Application, Interview, Department, Designation } = require('../models');
const { authenticate, authorize, requireTenantAccess } = require('../middleware/auth');
const { tenantFilter, assertTenantRelation } = require('../utils/tenant');
const { parsePagination, paginatedResponse, escapeRegex } = require('../utils/pagination');
const { writeAudit } = require('../utils/audit');

const router = express.Router();
const jobSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().min(20).max(20000),
  location: z.string().trim().max(160).optional(),
  employmentType: z.enum(['full_time', 'part_time', 'contract', 'intern']).optional(),
  departmentId: z.string().regex(/^[a-f\d]{24}$/i).optional().nullable(),
  designationId: z.string().regex(/^[a-f\d]{24}$/i).optional().nullable(),
});
const candidateSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.string().email().max(254),
  phone: z.string().trim().max(32).optional(),
  source: z.string().trim().max(80).optional(),
});

router.get('/jobs/public', async (req, res) => {
  if (!req.query.companyId || !/^[a-f\d]{24}$/i.test(req.query.companyId)) {
    return res.status(400).json({ message: 'A valid companyId is required.' });
  }
  const { page, limit, skip, sort } = parsePagination(req.query);
  const filter = { companyId: req.query.companyId, status: 'published' };
  const [data, total] = await Promise.all([
    Job.find(filter).select('title description location employmentType departmentId designationId publishedAt')
      .populate('departmentId', 'name').populate('designationId', 'title').sort(sort).skip(skip).limit(limit).lean(),
    Job.countDocuments(filter),
  ]);
  return res.json(paginatedResponse(data, total, page, limit));
});

router.get('/jobs', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'recruiter'), async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query);
  const filter = tenantFilter(req.user, req.query.companyId);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.q) filter.title = { $regex: escapeRegex(req.query.q.trim().slice(0, 100)), $options: 'i' };
  const [data, total] = await Promise.all([
    Job.find(filter).populate('departmentId', 'name').populate('designationId', 'title').sort(sort).skip(skip).limit(limit).lean(),
    Job.countDocuments(filter),
  ]);
  return res.json(paginatedResponse(data, total, page, limit));
});

router.post('/jobs', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'recruiter'), requireTenantAccess, async (req, res) => {
  const input = jobSchema.parse(req.body);
  const companyId = req.user.role === 'super_admin' ? req.body.companyId : req.user.companyId;
  if (!companyId) return res.status(400).json({ message: 'companyId is required.' });
  if (input.departmentId) {
    const department = await Department.findOne({ _id: input.departmentId, companyId }).select('companyId');
    assertTenantRelation(companyId, department, 'Department');
  }
  if (input.designationId) {
    const designation = await Designation.findOne({ _id: input.designationId, companyId }).select('companyId');
    assertTenantRelation(companyId, designation, 'Designation');
  }
  const job = await Job.create({ ...input, companyId, createdBy: req.user.id });
  await writeAudit(req, 'job.created', 'Job', job._id);
  return res.status(201).json(job);
});

router.put('/jobs/:id', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'recruiter'), requireTenantAccess, async (req, res) => {
  const input = jobSchema.partial().parse(req.body);
  const filter = { _id: req.params.id, ...tenantFilter(req.user, req.body.companyId) };
  const job = await Job.findOneAndUpdate(filter, input, { new: true, runValidators: true });
  if (!job) return res.status(404).json({ message: 'Job not found.' });
  await writeAudit(req, 'job.updated', 'Job', job._id, { fields: Object.keys(input) });
  return res.json(job);
});

router.patch('/jobs/:id/publish', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'recruiter'), requireTenantAccess, async (req, res) => {
  const filter = { _id: req.params.id, ...tenantFilter(req.user, req.body?.companyId), status: { $in: ['draft', 'published'] } };
  const job = await Job.findOneAndUpdate(filter, { $set: { status: 'published', publishedAt: new Date() } }, { new: true });
  if (!job) return res.status(404).json({ message: 'Draft job not found.' });
  await writeAudit(req, 'job.published', 'Job', job._id);
  return res.json(job);
});

router.patch('/jobs/:id/close', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'recruiter'), requireTenantAccess, async (req, res) => {
  const job = await Job.findOneAndUpdate(
    { _id: req.params.id, ...tenantFilter(req.user, req.body?.companyId), status: { $ne: 'closed' } },
    { $set: { status: 'closed' } },
    { new: true },
  );
  if (!job) return res.status(404).json({ message: 'Job not found.' });
  await writeAudit(req, 'job.closed', 'Job', job._id);
  return res.json(job);
});

router.get('/candidates', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'recruiter'), async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query);
  const filter = tenantFilter(req.user, req.query.companyId);
  if (req.query.q) filter.$or = [
    { fullName: { $regex: escapeRegex(req.query.q.trim().slice(0, 100)), $options: 'i' } },
    { email: { $regex: escapeRegex(req.query.q.trim().slice(0, 100)), $options: 'i' } },
  ];
  const [data, total] = await Promise.all([
    Candidate.find(filter).populate('resumeDocumentId', 'name mimeType sizeBytes').sort(sort).skip(skip).limit(limit).lean(),
    Candidate.countDocuments(filter),
  ]);
  return res.json(paginatedResponse(data, total, page, limit));
});

router.post('/candidates', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'recruiter'), requireTenantAccess, async (req, res) => {
  const input = candidateSchema.parse(req.body);
  const companyId = req.user.role === 'super_admin' ? req.body.companyId : req.user.companyId;
  if (!companyId) return res.status(400).json({ message: 'companyId is required.' });
  let candidate = await Candidate.findOne({ companyId, email: input.email.toLowerCase() });
  if (candidate) {
    candidate.set({ ...input, email: input.email.toLowerCase() });
    await candidate.save();
  } else {
    candidate = await Candidate.create({ ...input, companyId, email: input.email.toLowerCase() });
  }
  await writeAudit(req, 'candidate.created_or_updated', 'Candidate', candidate._id);
  return res.status(201).json(candidate);
});

router.get('/applications', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'recruiter'), async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query);
  const filter = tenantFilter(req.user, req.query.companyId);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.jobId) filter.jobId = req.query.jobId;
  const [data, total] = await Promise.all([
    Application.find(filter).populate('jobId', 'title').populate('candidateId', 'fullName email').sort(sort).skip(skip).limit(limit).lean(),
    Application.countDocuments(filter),
  ]);
  return res.json(paginatedResponse(data, total, page, limit));
});

router.post('/applications', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'recruiter'), requireTenantAccess, async (req, res) => {
  const input = z.object({
    jobId: z.string().regex(/^[a-f\d]{24}$/i),
    candidateId: z.string().regex(/^[a-f\d]{24}$/i),
  }).parse(req.body);
  const companyId = req.user.role === 'super_admin' ? req.body.companyId : req.user.companyId;
  if (!companyId) return res.status(400).json({ message: 'companyId is required.' });
  const [job, candidate] = await Promise.all([
    Job.findOne({ _id: input.jobId, companyId, status: 'published' }).select('_id companyId'),
    Candidate.findOne({ _id: input.candidateId, companyId }).select('_id companyId'),
  ]);
  assertTenantRelation(companyId, job, 'Published job');
  assertTenantRelation(companyId, candidate, 'Candidate');
  const application = await Application.create({
    ...input,
    companyId,
    stageHistory: [{ stage: 'applied', changedBy: req.user.id }],
  });
  await writeAudit(req, 'application.created', 'Application', application._id);
  return res.status(201).json(application);
});

router.patch('/applications/:id/stage', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'recruiter'), requireTenantAccess, async (req, res) => {
  const input = z.object({
    status: z.enum(['screening', 'shortlisted', 'interview', 'offered', 'hired', 'rejected', 'withdrawn']),
    note: z.string().max(1000).optional(),
  }).parse(req.body);
  const filter = { _id: req.params.id, ...tenantFilter(req.user, req.body.companyId) };
  const application = await Application.findOneAndUpdate(
    filter,
    {
      $set: { status: input.status, notes: input.note },
      $push: { stageHistory: { stage: input.status, changedBy: req.user.id, changedAt: new Date(), note: input.note } },
    },
    { new: true, runValidators: true },
  );
  if (!application) return res.status(404).json({ message: 'Application not found.' });
  await writeAudit(req, 'application.stage_changed', 'Application', application._id, { status: input.status });
  return res.json(application);
});

router.get('/interviews', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'recruiter'), async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query);
  const filter = tenantFilter(req.user, req.query.companyId);
  const [data, total] = await Promise.all([
    Interview.find(filter).populate({ path: 'applicationId', populate: [{ path: 'jobId', select: 'title' }, { path: 'candidateId', select: 'fullName email' }] })
      .sort(sort).skip(skip).limit(limit).lean(),
    Interview.countDocuments(filter),
  ]);
  return res.json(paginatedResponse(data, total, page, limit));
});

router.post('/interviews', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'recruiter'), requireTenantAccess, async (req, res) => {
  const input = z.object({
    applicationId: z.string().regex(/^[a-f\d]{24}$/i),
    interviewerIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(10),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    location: z.string().max(250).optional(),
  }).parse(req.body);
  if (input.endsAt <= input.startsAt) return res.status(400).json({ message: 'Interview end must be after its start.' });
  const companyId = req.user.role === 'super_admin' ? req.body.companyId : req.user.companyId;
  if (!companyId) return res.status(400).json({ message: 'companyId is required.' });
  const application = await Application.findOne({ _id: input.applicationId, companyId }).select('_id companyId');
  assertTenantRelation(companyId, application, 'Application');
  const interview = await Interview.create({ ...input, companyId });
  await writeAudit(req, 'interview.scheduled', 'Interview', interview._id);
  return res.status(201).json(interview);
});

router.get('/analytics', authenticate, authorize('super_admin', 'company_admin', 'hr_manager', 'recruiter'), async (req, res) => {
  const filter = tenantFilter(req.user, req.query.companyId);
  const [openJobs, candidates, stages] = await Promise.all([
    Job.countDocuments({ ...filter, status: 'published' }),
    Candidate.countDocuments(filter),
    Application.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);
  return res.json({ openJobs, candidates, applications: Object.fromEntries(stages.map((stage) => [stage._id, stage.count])) });
});

module.exports = router;
