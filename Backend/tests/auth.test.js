const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../app');
const { connectDB } = require('../config/db');
const { Company, User } = require('../models');

const mongoUri = process.env.MONGO_TEST_URI
  || `mongodb://127.0.0.1:27017/workspherex_test_auth_${process.pid}`;

describe('WorkSphere X authentication and tenant isolation', () => {
  let company;
  let otherCompany;
  let admin;
  let adminToken;
  let superAdmin;
  let employee;

  beforeAll(async () => {
    await connectDB(mongoUri);
    company = await Company.create({ name: 'Northstar Test', slug: `northstar-test-${process.pid}`, email: 'admin@northstar.test', status: 'active' });
    otherCompany = await Company.create({ name: 'BluePeak Test', slug: `bluepeak-test-${process.pid}`, email: 'admin@bluepeak.test', status: 'active' });
    admin = await User.create({
      companyId: company._id,
      fullName: 'Test Admin',
      email: `admin-${process.pid}@northstar.test`,
      passwordHash: 'Testing@Password123',
      role: 'company_admin',
      status: 'active',
    });
    superAdmin = await User.create({
      fullName: 'Test Super Admin',
      email: `superadmin-${process.pid}@worksphere.test`,
      passwordHash: 'Testing@Password123',
      role: 'super_admin',
      status: 'active',
    });
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });

  it('authenticates, rotates the refresh token, and prevents cross-tenant record access', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: admin.email, password: 'Testing@Password123' })
      .expect(200);
    adminToken = login.body.accessToken;
    expect(login.body.user.role).toBe('company_admin');
    expect(login.headers['set-cookie'].join(';')).toContain('HttpOnly');
    await request(app)
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const employeeResponse = await request(app)
      .post('/api/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        firstName: 'Ava',
        lastName: 'Johnson',
        email: 'ava@northstar.test',
        departmentId: null,
      })
      .expect(201);
    employee = employeeResponse.body;

    await request(app)
      .get(`/api/employees/${employee._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const foreignEmployee = await require('../models').Employee.create({
      companyId: otherCompany._id,
      employeeCode: 'FOREIGN-100',
      firstName: 'Foreign',
      lastName: 'Employee',
      email: 'foreign@bluepeak.test',
    });
    await request(app)
      .get(`/api/employees/${foreignEmployee._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(404);

    const refreshCookie = login.headers['set-cookie'].find((cookie) => cookie.startsWith('refreshToken=')).split(';')[0];
    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie).expect(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      .expect(200);
    await request(app).post('/api/auth/refresh').set('Cookie', refreshCookie).expect(401);
  });

  it('authenticates platform admins and enforces the admin-only role', async () => {
    await request(app)
      .get('/api/auth/admin-only')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: superAdmin.email, password: 'Testing@Password123' })
      .expect(200);

    expect(login.body.user.role).toBe('super_admin');
    expect(login.body.company).toBeNull();
    await request(app)
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    await request(app)
      .get('/api/auth/admin-only')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
  });
});
