const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const { connectDB } = require('../config/db');
const models = require('../models');
const { calculatePayroll } = require('../services/payroll');

const mongoUri = process.env.MONGO_TEST_URI
  || `mongodb://127.0.0.1:27017/workspherex_test_modules_${process.pid}`;

describe('WorkSphere X HRMS modules', () => {
  let company;
  let admin;
  let adminToken;
  let financeToken;
  let employee;

  beforeAll(async () => {
    await connectDB(mongoUri);
    company = await models.Company.create({
      name: 'WorkSphere Test',
      slug: `worksphere-test-${process.pid}`,
      email: `admin-${process.pid}@worksphere.test`,
      status: 'active',
    });
    admin = await models.User.create({
      companyId: company._id,
      fullName: 'Company Admin',
      email: `admin-${process.pid}@worksphere.test`,
      passwordHash: 'Test@Password1234',
      role: 'company_admin',
      status: 'active',
    });
    const finance = await models.User.create({
      companyId: company._id,
      fullName: 'Finance Manager',
      email: `finance-${process.pid}@worksphere.test`,
      passwordHash: 'Finance@Password1234',
      role: 'finance_manager',
      status: 'active',
    });
    const [adminLogin, financeLogin] = await Promise.all([
      request(app).post('/api/auth/login').send({ email: admin.email, password: 'Test@Password1234' }),
      request(app).post('/api/auth/login').send({ email: finance.email, password: 'Finance@Password1234' }),
    ]);
    adminToken = adminLogin.body.accessToken;
    financeToken = financeLogin.body.accessToken;
    employee = await models.Employee.create({
      companyId: company._id,
      employeeCode: 'WSX-TEST-1',
      firstName: 'Morgan',
      lastName: 'Rivera',
      email: `morgan-${process.pid}@worksphere.test`,
    });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('registers all requested Mongoose models with timestamps and indexes', () => {
    const expected = [
      'User', 'Company', 'Employee', 'Department', 'Designation', 'Attendance', 'Shift',
      'Leave', 'LeaveBalance', 'Payroll', 'SalaryStructure', 'Job', 'Candidate', 'Application',
      'Interview', 'Performance', 'Project', 'Task', 'Asset', 'Document', 'Expense',
      'Notification', 'AuditLog', 'Subscription',
    ];
    expect(Object.keys(models).sort()).toEqual(expected.sort());
    for (const name of expected) {
      expect(models[name].schema.options.timestamps).toBe(true);
      expect(models[name].schema.indexes().length).toBeGreaterThan(0);
    }
  });

  it('handles attendance, leave approvals, payroll generation/locking, recruitment, and expenses', async () => {
    const checkIn = await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: String(employee._id) })
      .expect(201);
    expect(checkIn.body.status).toBe('present');
    await request(app)
      .post('/api/attendance/check-in')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: String(employee._id) })
      .expect(409);
    const checkOut = await request(app)
      .post('/api/attendance/check-out')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: String(employee._id) })
      .expect(200);
    expect(checkOut.body.workedMinutes).toBeGreaterThanOrEqual(0);
    await request(app).get('/api/attendance/history').set('Authorization', `Bearer ${adminToken}`).expect(200);

    const leaveStart = new Date();
    leaveStart.setUTCDate(leaveStart.getUTCDate() + 1);
    while (leaveStart.getUTCDay() === 0 || leaveStart.getUTCDay() === 6) leaveStart.setUTCDate(leaveStart.getUTCDate() + 1);
    const leaveDate = leaveStart.toISOString().slice(0, 10);
    const leaveResponse = await request(app)
      .post('/api/leaves')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: String(employee._id), category: 'annual', startDate: leaveDate, endDate: leaveDate, reason: 'Annual leave for a family commitment.' })
      .expect(201);
    const approval = await request(app)
      .post(`/api/approvals/leave/${leaveResponse.body._id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'approve' })
      .expect(200);
    expect(approval.body.record.status).toBe('approved');

    await request(app)
      .post('/api/payroll/salary-structures')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employeeId: String(employee._id),
        effectiveFrom: new Date().toISOString(),
        basicMonthly: 5000,
        hraMonthly: 1000,
        allowancesMonthly: 250,
        taxRate: 0.1,
        currency: 'USD',
      })
      .expect(201);
    const now = new Date();
    const generated = await request(app)
      .post('/api/payroll/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 })
      .expect(201);
    expect(generated.body.created).toHaveLength(1);
    expect(generated.body.created[0].grossPay).toBeGreaterThan(0);
    const duplicate = await request(app)
      .post('/api/payroll/generate')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 })
      .expect(201);
    expect(duplicate.body.skipped[0].reason).toMatch(/already exists/i);
    await request(app)
      .post(`/api/approvals/payroll/${generated.body.created[0]._id}/decision`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ action: 'approve' })
      .expect(200);
    const payrollFinalApproval = await request(app)
      .post(`/api/approvals/payroll/${generated.body.created[0]._id}/decision`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'approve' })
      .expect(200);
    expect(payrollFinalApproval.body.record.status).toBe('approved');
    await request(app)
      .post(`/api/payroll/${generated.body.created[0]._id}/lock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    const job = await request(app)
      .post('/api/recruitment/jobs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'People Operations Manager', description: 'Lead people operations systems and processes for our growing organization.' })
      .expect(201);
    await request(app)
      .patch(`/api/recruitment/jobs/${job.body._id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);
    const candidate = await request(app)
      .post('/api/recruitment/candidates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ fullName: 'Taylor Candidate', email: `taylor-${process.pid}@candidate.test` })
      .expect(201);
    const application = await request(app)
      .post('/api/recruitment/applications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ jobId: job.body._id, candidateId: candidate.body._id })
      .expect(201);
    await request(app)
      .patch(`/api/recruitment/applications/${application.body._id}/stage`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'shortlisted' })
      .expect(200);

    const expense = await request(app)
      .post('/api/expenses')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employeeId: String(employee._id), category: 'Travel', amount: 125.5, incurredAt: new Date().toISOString(), description: 'Business travel to client meeting.' })
      .expect(201);
    await request(app)
      .post(`/api/approvals/expense/${expense.body._id}/decision`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ action: 'approve' })
      .expect(200);
  });

  it('calculates attendance-prorated monthly payroll and overtime', () => {
    const result = calculatePayroll({
      salary: { basicMonthly: 5000, hraMonthly: 1000, allowancesMonthly: 500, taxRate: 0.1, overtimeMultiplier: 1.5 },
      year: 2026,
      month: 11,
      attendance: { presentDays: 10, overtimeMinutes: 120 },
      paidLeaveDays: 2,
      unpaidLeaveDays: 1,
      bonus: 200,
    });
    expect(result.grossPay).toBeGreaterThan(0);
    expect(result.netPay).toBeLessThan(result.grossPay);
    expect(result.paidDays).toBe(12);
  });
});
