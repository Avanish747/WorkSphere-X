const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { Schema } = mongoose;
const objectId = Schema.Types.ObjectId;
const commonOptions = { timestamps: true, minimize: false };

const companyField = {
  type: objectId,
  ref: 'Company',
  required: true,
  index: true,
};

const register = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

const companySchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, lowercase: true, trim: true, unique: true },
  industry: { type: String, trim: true, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  location: { type: String, trim: true },
  status: { type: String, enum: ['active', 'suspended', 'trial'], default: 'trial', index: true },
  settings: {
    timezone: { type: String, default: 'UTC' },
    currency: { type: String, default: 'USD' },
    attendanceGraceMinutes: { type: Number, min: 0, max: 180, default: 10 },
    standardWorkdayHours: { type: Number, min: 1, max: 24, default: 8 },
    taxRate: { type: Number, min: 0, max: 1, default: 0.1 },
  },
}, commonOptions);
companySchema.index({ status: 1, createdAt: -1 });

const userSchema = new Schema({
  companyId: { type: objectId, ref: 'Company', default: null, index: true },
  employeeId: { type: objectId, ref: 'Employee', default: null },
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true },
  passwordHash: { type: String, required: true, select: false },
  role: {
    type: String,
    enum: ['super_admin', 'company_admin', 'hr_manager', 'department_manager', 'finance_manager', 'recruiter', 'employee'],
    default: 'employee',
    index: true,
  },
  status: { type: String, enum: ['active', 'inactive', 'suspended'], default: 'active', index: true },
  permissions: [{ type: String, trim: true }],
  refreshTokenHash: { type: String, select: false },
  refreshTokenExpiresAt: { type: Date, select: false },
  passwordResetHash: { type: String, select: false },
  passwordResetExpiresAt: { type: Date, select: false },
  emailVerificationHash: { type: String, select: false },
  emailVerificationExpiresAt: { type: Date, select: false },
  emailVerifiedAt: { type: Date },
  failedLoginAttempts: { type: Number, default: 0, select: false },
  lockUntil: { type: Date, select: false },
  passwordChangedAt: { type: Date },
  lastLoginAt: { type: Date },
}, commonOptions);
userSchema.index({ companyId: 1, role: 1, status: 1 });
userSchema.pre('save', async function hashPassword() {
  if (this.isModified('passwordHash') && !this.passwordHash.startsWith('$2')) {
    this.passwordHash = await bcrypt.hash(this.passwordHash, 12);
  }
});
userSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

const departmentSchema = new Schema({
  companyId: companyField,
  name: { type: String, required: true, trim: true, maxlength: 80 },
  code: { type: String, trim: true, uppercase: true },
  managerId: { type: objectId, ref: 'Employee', default: null },
  description: { type: String, maxlength: 500 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, commonOptions);
departmentSchema.index({ companyId: 1, name: 1 }, { unique: true });

const designationSchema = new Schema({
  companyId: companyField,
  departmentId: { type: objectId, ref: 'Department', default: null },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  level: { type: String, trim: true },
  description: { type: String, maxlength: 500 },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, commonOptions);
designationSchema.index({ companyId: 1, departmentId: 1, title: 1 }, { unique: true });

const employeeSchema = new Schema({
  companyId: companyField,
  userId: { type: objectId, ref: 'User', default: null },
  employeeCode: { type: String, required: true, trim: true, uppercase: true },
  firstName: { type: String, required: true, trim: true, maxlength: 80 },
  lastName: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  dateOfBirth: { type: Date },
  joinDate: { type: Date, required: true, default: Date.now },
  exitDate: { type: Date },
  employmentType: { type: String, enum: ['full_time', 'part_time', 'contract', 'intern'], default: 'full_time' },
  status: { type: String, enum: ['active', 'inactive', 'on_leave', 'terminated'], default: 'active', index: true },
  departmentId: { type: objectId, ref: 'Department', default: null },
  designationId: { type: objectId, ref: 'Designation', default: null },
  managerId: { type: objectId, ref: 'Employee', default: null },
  shiftId: { type: objectId, ref: 'Shift', default: null },
  address: { type: String, maxlength: 500 },
  emergencyContact: { name: String, phone: String, relationship: String },
  documentIds: [{ type: objectId, ref: 'Document' }],
}, commonOptions);
employeeSchema.index({ companyId: 1, employeeCode: 1 }, { unique: true });
employeeSchema.index({ companyId: 1, email: 1 }, { unique: true });
employeeSchema.index({ companyId: 1, status: 1, departmentId: 1, joinDate: -1 });
employeeSchema.index({ companyId: 1, firstName: 1, lastName: 1 });

const shiftSchema = new Schema({
  companyId: companyField,
  name: { type: String, required: true, trim: true, maxlength: 80 },
  startTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  endTime: { type: String, required: true, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
  graceMinutes: { type: Number, min: 0, max: 180, default: 10 },
  workDays: [{ type: Number, min: 0, max: 6 }],
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, commonOptions);
shiftSchema.index({ companyId: 1, name: 1 }, { unique: true });

const attendanceSchema = new Schema({
  companyId: companyField,
  employeeId: { type: objectId, ref: 'Employee', required: true },
  shiftId: { type: objectId, ref: 'Shift', default: null },
  workDate: { type: Date, required: true },
  checkInAt: { type: Date, required: true },
  checkOutAt: { type: Date },
  workedMinutes: { type: Number, min: 0, default: 0 },
  overtimeMinutes: { type: Number, min: 0, default: 0 },
  lateMinutes: { type: Number, min: 0, default: 0 },
  earlyDepartureMinutes: { type: Number, min: 0, default: 0 },
  status: { type: String, enum: ['present', 'late', 'absent', 'half_day', 'on_leave'], default: 'present' },
  note: { type: String, maxlength: 500 },
}, commonOptions);
attendanceSchema.index({ companyId: 1, employeeId: 1, workDate: 1 }, { unique: true });
attendanceSchema.index({ companyId: 1, workDate: 1, status: 1 });

const leaveSchema = new Schema({
  companyId: companyField,
  employeeId: { type: objectId, ref: 'Employee', required: true },
  category: { type: String, enum: ['annual', 'sick', 'personal', 'parental', 'unpaid', 'other'], required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  days: { type: Number, required: true, min: 0.5 },
  reason: { type: String, required: true, maxlength: 1000 },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending', index: true },
  currentApprovalLevel: { type: Number, min: 0, default: 0 },
  approvals: [{ approverId: { type: objectId, ref: 'User' }, role: String, action: { type: String, enum: ['approved', 'rejected'] }, note: String, actedAt: Date }],
}, commonOptions);
leaveSchema.index({ companyId: 1, employeeId: 1, startDate: -1 });
leaveSchema.index({ companyId: 1, status: 1, startDate: 1 });

const leaveBalanceSchema = new Schema({
  companyId: companyField,
  employeeId: { type: objectId, ref: 'Employee', required: true },
  year: { type: Number, required: true, min: 2000, max: 2200 },
  categories: {
    annual: { total: { type: Number, min: 0, default: 20 }, used: { type: Number, min: 0, default: 0 }, reserved: { type: Number, min: 0, default: 0 } },
    sick: { total: { type: Number, min: 0, default: 10 }, used: { type: Number, min: 0, default: 0 }, reserved: { type: Number, min: 0, default: 0 } },
    personal: { total: { type: Number, min: 0, default: 5 }, used: { type: Number, min: 0, default: 0 }, reserved: { type: Number, min: 0, default: 0 } },
    parental: { total: { type: Number, min: 0, default: 60 }, used: { type: Number, min: 0, default: 0 }, reserved: { type: Number, min: 0, default: 0 } },
  },
}, commonOptions);
leaveBalanceSchema.index({ companyId: 1, employeeId: 1, year: 1 }, { unique: true });

const salaryStructureSchema = new Schema({
  companyId: companyField,
  employeeId: { type: objectId, ref: 'Employee', required: true },
  effectiveFrom: { type: Date, required: true },
  basicMonthly: { type: Number, required: true, min: 0 },
  hraMonthly: { type: Number, min: 0, default: 0 },
  allowancesMonthly: { type: Number, min: 0, default: 0 },
  taxRate: { type: Number, min: 0, max: 1, default: 0.1 },
  overtimeMultiplier: { type: Number, min: 1, max: 5, default: 1.5 },
  currency: { type: String, uppercase: true, default: 'USD' },
  status: { type: String, enum: ['active', 'superseded'], default: 'active' },
}, commonOptions);
salaryStructureSchema.index({ companyId: 1, employeeId: 1, effectiveFrom: -1 });

const payrollSchema = new Schema({
  companyId: companyField,
  employeeId: { type: objectId, ref: 'Employee', required: true },
  periodYear: { type: Number, required: true, min: 2000, max: 2200 },
  periodMonth: { type: Number, required: true, min: 1, max: 12 },
  currency: { type: String, uppercase: true, default: 'USD' },
  earnings: { basic: { type: Number, min: 0, default: 0 }, hra: { type: Number, min: 0, default: 0 }, allowances: { type: Number, min: 0, default: 0 }, bonus: { type: Number, min: 0, default: 0 }, overtime: { type: Number, min: 0, default: 0 } },
  deductions: { tax: { type: Number, min: 0, default: 0 }, unpaidLeave: { type: Number, min: 0, default: 0 }, other: { type: Number, min: 0, default: 0 } },
  grossPay: { type: Number, min: 0, required: true },
  netPay: { type: Number, min: 0, required: true },
  status: { type: String, enum: ['draft', 'pending_approval', 'approved', 'locked', 'paid'], default: 'draft', index: true },
  currentApprovalLevel: { type: Number, min: 0, default: 0 },
  approvals: [{ approverId: { type: objectId, ref: 'User' }, role: String, action: String, note: String, actedAt: Date }],
  generatedBy: { type: objectId, ref: 'User', required: true },
  lockedAt: { type: Date },
  paidAt: { type: Date },
}, commonOptions);
payrollSchema.index({ companyId: 1, employeeId: 1, periodYear: 1, periodMonth: 1 }, { unique: true });
payrollSchema.index({ companyId: 1, periodYear: 1, periodMonth: 1, status: 1 });

const jobSchema = new Schema({
  companyId: companyField,
  departmentId: { type: objectId, ref: 'Department', default: null },
  designationId: { type: objectId, ref: 'Designation', default: null },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, required: true, maxlength: 20000 },
  location: { type: String, trim: true, maxlength: 160 },
  employmentType: { type: String, enum: ['full_time', 'part_time', 'contract', 'intern'], default: 'full_time' },
  status: { type: String, enum: ['draft', 'published', 'closed'], default: 'draft', index: true },
  publishedAt: { type: Date },
  createdBy: { type: objectId, ref: 'User', required: true },
}, commonOptions);
jobSchema.index({ companyId: 1, status: 1, createdAt: -1 });

const candidateSchema = new Schema({
  companyId: companyField,
  fullName: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  resumeDocumentId: { type: objectId, ref: 'Document', default: null },
  source: { type: String, trim: true },
}, commonOptions);
candidateSchema.index({ companyId: 1, email: 1 });

const applicationSchema = new Schema({
  companyId: companyField,
  jobId: { type: objectId, ref: 'Job', required: true },
  candidateId: { type: objectId, ref: 'Candidate', required: true },
  status: { type: String, enum: ['applied', 'screening', 'shortlisted', 'interview', 'offered', 'hired', 'rejected', 'withdrawn'], default: 'applied', index: true },
  notes: { type: String, maxlength: 3000 },
  stageHistory: [{ stage: String, changedBy: { type: objectId, ref: 'User' }, changedAt: { type: Date, default: Date.now }, note: String }],
}, commonOptions);
applicationSchema.index({ companyId: 1, jobId: 1, candidateId: 1 }, { unique: true });
applicationSchema.index({ companyId: 1, status: 1, updatedAt: -1 });

const interviewSchema = new Schema({
  companyId: companyField,
  applicationId: { type: objectId, ref: 'Application', required: true },
  interviewerIds: [{ type: objectId, ref: 'User' }],
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  location: { type: String, trim: true },
  status: { type: String, enum: ['scheduled', 'completed', 'cancelled'], default: 'scheduled' },
  feedback: { type: String, maxlength: 5000 },
}, commonOptions);
interviewSchema.index({ companyId: 1, startsAt: 1, status: 1 });

const performanceSchema = new Schema({
  companyId: companyField,
  employeeId: { type: objectId, ref: 'Employee', required: true },
  reviewerId: { type: objectId, ref: 'User', required: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  goals: [{ title: String, progress: { type: Number, min: 0, max: 100 }, note: String }],
  feedback: { type: String, maxlength: 5000 },
  status: { type: String, enum: ['draft', 'submitted', 'acknowledged'], default: 'draft' },
}, commonOptions);
performanceSchema.index({ companyId: 1, employeeId: 1, periodStart: -1 });

const projectSchema = new Schema({
  companyId: companyField,
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, maxlength: 3000 },
  ownerId: { type: objectId, ref: 'Employee', required: true },
  memberIds: [{ type: objectId, ref: 'Employee' }],
  startsAt: { type: Date },
  endsAt: { type: Date },
  status: { type: String, enum: ['planning', 'active', 'completed', 'archived'], default: 'planning' },
}, commonOptions);
projectSchema.index({ companyId: 1, status: 1, endsAt: 1 });

const taskSchema = new Schema({
  companyId: companyField,
  projectId: { type: objectId, ref: 'Project', default: null },
  title: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, maxlength: 5000 },
  assigneeId: { type: objectId, ref: 'Employee', default: null },
  dueAt: { type: Date },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  status: { type: String, enum: ['todo', 'in_progress', 'blocked', 'done'], default: 'todo' },
}, commonOptions);
taskSchema.index({ companyId: 1, assigneeId: 1, status: 1, dueAt: 1 });

const assetSchema = new Schema({
  companyId: companyField,
  assignedTo: { type: objectId, ref: 'Employee', default: null },
  assetTag: { type: String, required: true, trim: true, uppercase: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, trim: true },
  serialNumber: { type: String, trim: true },
  purchaseDate: { type: Date },
  status: { type: String, enum: ['available', 'assigned', 'maintenance', 'retired'], default: 'available' },
}, commonOptions);
assetSchema.index({ companyId: 1, assetTag: 1 }, { unique: true });

const documentSchema = new Schema({
  companyId: companyField,
  employeeId: { type: objectId, ref: 'Employee', default: null },
  uploadedBy: { type: objectId, ref: 'User', required: true },
  name: { type: String, required: true, maxlength: 255 },
  storageKey: { type: String, required: true, unique: true, select: false },
  mimeType: { type: String, enum: ['application/pdf', 'image/jpeg', 'image/png'], required: true },
  sizeBytes: { type: Number, required: true, min: 1, max: 10485760 },
  category: { type: String, enum: ['resume', 'identity', 'contract', 'certificate', 'other'], default: 'other' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
}, commonOptions);
documentSchema.index({ companyId: 1, employeeId: 1, createdAt: -1 });

const expenseSchema = new Schema({
  companyId: companyField,
  employeeId: { type: objectId, ref: 'Employee', required: true },
  category: { type: String, required: true, trim: true, maxlength: 80 },
  amount: { type: Number, required: true, min: 0.01 },
  currency: { type: String, uppercase: true, default: 'USD' },
  incurredAt: { type: Date, required: true },
  description: { type: String, required: true, maxlength: 1500 },
  receiptDocumentId: { type: objectId, ref: 'Document', default: null },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'paid'], default: 'pending', index: true },
  currentApprovalLevel: { type: Number, min: 0, default: 0 },
  approvals: [{ approverId: { type: objectId, ref: 'User' }, role: String, action: String, note: String, actedAt: Date }],
}, commonOptions);
expenseSchema.index({ companyId: 1, employeeId: 1, createdAt: -1 });

const notificationSchema = new Schema({
  companyId: companyField,
  userId: { type: objectId, ref: 'User', required: true },
  type: { type: String, required: true, maxlength: 60 },
  title: { type: String, required: true, maxlength: 160 },
  message: { type: String, required: true, maxlength: 1000 },
  resourceType: { type: String },
  resourceId: { type: objectId },
  readAt: { type: Date },
}, commonOptions);
notificationSchema.index({ companyId: 1, userId: 1, readAt: 1, createdAt: -1 });

const messageSchema = new Schema({
  companyId: companyField,
  senderId: { type: objectId, ref: 'User', required: true },
  recipientIds: [{ type: objectId, ref: 'User', required: true }],
  conversationId: { type: String, required: true, maxlength: 120 },
  body: { type: String, required: true, trim: true, maxlength: 5000 },
  readBy: [{ userId: { type: objectId, ref: 'User' }, readAt: Date }],
}, commonOptions);
messageSchema.index({ companyId: 1, conversationId: 1, createdAt: -1 });
messageSchema.index({ companyId: 1, recipientIds: 1, createdAt: -1 });

const announcementSchema = new Schema({
  companyId: companyField,
  authorId: { type: objectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  body: { type: String, required: true, trim: true, maxlength: 10000 },
  audience: { type: String, enum: ['everyone', 'department'], default: 'everyone' },
  departmentId: { type: objectId, ref: 'Department', default: null },
  publishedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },
}, commonOptions);
announcementSchema.index({ companyId: 1, publishedAt: -1, expiresAt: 1 });

const auditLogSchema = new Schema({
  companyId: { type: objectId, ref: 'Company', default: null, index: true },
  actorId: { type: objectId, ref: 'User', default: null },
  action: { type: String, required: true, maxlength: 120 },
  resourceType: { type: String, required: true, maxlength: 80 },
  resourceId: { type: objectId },
  metadata: { type: Schema.Types.Mixed, default: {} },
  ipAddress: { type: String, maxlength: 64 },
}, commonOptions);
auditLogSchema.index({ companyId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

const subscriptionSchema = new Schema({
  companyId: { ...companyField, unique: true },
  plan: { type: String, enum: ['starter', 'growth', 'enterprise'], default: 'starter' },
  status: { type: String, enum: ['trialing', 'active', 'past_due', 'cancelled'], default: 'trialing', index: true },
  seatLimit: { type: Number, min: 1, default: 25 },
  monthlyPrice: { type: Number, min: 0, default: 0 },
  currency: { type: String, uppercase: true, default: 'USD' },
  currentPeriodStart: { type: Date },
  currentPeriodEnd: { type: Date },
  providerCustomerId: { type: String, select: false },
  providerSubscriptionId: { type: String, select: false },
}, commonOptions);

module.exports = {
  User: register('User', userSchema),
  Company: register('Company', companySchema),
  Employee: register('Employee', employeeSchema),
  Department: register('Department', departmentSchema),
  Designation: register('Designation', designationSchema),
  Attendance: register('Attendance', attendanceSchema),
  Shift: register('Shift', shiftSchema),
  Leave: register('Leave', leaveSchema),
  LeaveBalance: register('LeaveBalance', leaveBalanceSchema),
  Payroll: register('Payroll', payrollSchema),
  SalaryStructure: register('SalaryStructure', salaryStructureSchema),
  Job: register('Job', jobSchema),
  Candidate: register('Candidate', candidateSchema),
  Application: register('Application', applicationSchema),
  Interview: register('Interview', interviewSchema),
  Performance: register('Performance', performanceSchema),
  Project: register('Project', projectSchema),
  Task: register('Task', taskSchema),
  Asset: register('Asset', assetSchema),
  Document: register('Document', documentSchema),
  Expense: register('Expense', expenseSchema),
  Notification: register('Notification', notificationSchema),
  Message: register('Message', messageSchema),
  Announcement: register('Announcement', announcementSchema),
  AuditLog: register('AuditLog', auditLogSchema),
  Subscription: register('Subscription', subscriptionSchema),
};
