require('dotenv').config();
const { connectDB } = require('./db');
const { User, Company, Subscription } = require('../models');

const demoDefaults = {
  superAdmin: {
    name: 'WorkSphere X Super Admin',
    email: 'superadmin@workspherex.local',
  },
  companyAdmin: {
    name: 'WorkSphere X Company Admin',
    email: 'admin@workspherex.local',
  },
  companyAccounts: [
    { name: 'WorkSphere X HR Manager', role: 'hr_manager', email: 'hr@workspherex.local' },
    { name: 'WorkSphere X Department Manager', role: 'department_manager', email: 'manager@workspherex.local' },
    { name: 'WorkSphere X Finance Manager', role: 'finance_manager', email: 'finance@workspherex.local' },
    { name: 'WorkSphere X Recruiter', role: 'recruiter', email: 'recruiter@workspherex.local' },
    { name: 'WorkSphere X Employee', role: 'employee', email: 'employee@workspherex.local' },
  ],
  company: {
    name: 'WorkSphere X Demo',
    slug: 'workspherex-demo',
  },
};

function assertDevelopment() {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Demo accounts can only be seeded when NODE_ENV=development.');
  }
}

function getSeedConfig() {
  const requiredPassword = (environmentVariable) => {
    const password = process.env[environmentVariable];
    if (!password) {
      throw new Error(`${environmentVariable} is required to seed demo accounts.`);
    }
    return password;
  };
  const config = {
    superAdmin: {
      name: process.env.DEMO_SUPER_ADMIN_NAME || demoDefaults.superAdmin.name,
      email: (process.env.DEMO_SUPER_ADMIN_EMAIL || demoDefaults.superAdmin.email).trim().toLowerCase(),
      password: requiredPassword('DEMO_SUPER_ADMIN_PASSWORD'),
    },
    companyAdmin: {
      name: process.env.DEMO_COMPANY_ADMIN_NAME || demoDefaults.companyAdmin.name,
      email: (process.env.DEMO_COMPANY_ADMIN_EMAIL || demoDefaults.companyAdmin.email).trim().toLowerCase(),
      password: requiredPassword('DEMO_COMPANY_ADMIN_PASSWORD'),
    },
    company: {
      name: process.env.DEMO_COMPANY_NAME || demoDefaults.company.name,
      slug: demoDefaults.company.slug,
    },
    companyAccounts: demoDefaults.companyAccounts.map((account) => ({
      ...account,
      email: (process.env[`DEMO_${account.role.toUpperCase()}_EMAIL`] || account.email).trim().toLowerCase(),
      password: requiredPassword(`DEMO_${account.role.toUpperCase()}_PASSWORD`),
    })),
  };

  const accounts = [config.superAdmin, config.companyAdmin, ...config.companyAccounts];
  if (new Set(accounts.map((account) => account.email)).size !== accounts.length) {
    throw new Error('Each demo role must use a different email address.');
  }
  for (const account of accounts) {
    if (account.password.length < 12) {
      throw new Error('Demo account passwords must be at least 12 characters.');
    }
  }

  return config;
}

async function findExistingAccount(email, role) {
  const user = await User.findOne({ email });
  if (!user) return null;
  if (user.role !== role || user.status !== 'active') {
    throw new Error(`The demo email ${email} is already assigned to a non-active ${role} account.`);
  }
  return user;
}

async function seedDemoAdmin() {
  assertDevelopment();
  const config = getSeedConfig();

  let superAdmin = await findExistingAccount(config.superAdmin.email, 'super_admin');
  if (!superAdmin) {
    superAdmin = await User.create({
      fullName: config.superAdmin.name,
      email: config.superAdmin.email,
      passwordHash: config.superAdmin.password,
      role: 'super_admin',
      status: 'active',
    });
  } else if (superAdmin.companyId) {
    throw new Error('The existing Super Admin demo account must not belong to a company.');
  }

  let companyAdmin = await findExistingAccount(config.companyAdmin.email, 'company_admin');
  if (companyAdmin && !companyAdmin.companyId) {
    throw new Error('The existing Company Admin demo account is not linked to a company.');
  }
  let company = companyAdmin?.companyId
    ? await Company.findById(companyAdmin.companyId)
    : await Company.findOne({ slug: config.company.slug });

  if (companyAdmin && !company) {
    throw new Error('The existing Company Admin demo account references a missing company.');
  }
  if (!company) {
    company = await Company.create({
      name: config.company.name,
      slug: config.company.slug,
      email: config.companyAdmin.email,
      status: 'active',
    });
  }
  if (company.status === 'suspended') {
    throw new Error('The existing demo company is suspended; the seeder will not change its status.');
  }

  if (!companyAdmin) {
    companyAdmin = await User.create({
      companyId: company._id,
      fullName: config.companyAdmin.name,
      email: config.companyAdmin.email,
      passwordHash: config.companyAdmin.password,
      role: 'company_admin',
      status: 'active',
    });
  }

  for (const account of config.companyAccounts) {
    let user = await findExistingAccount(account.email, account.role);
    if (!user) {
      user = await User.create({
        companyId: company._id,
        fullName: account.name,
        email: account.email,
        passwordHash: account.password,
        role: account.role,
        status: 'active',
      });
    } else if (String(user.companyId) !== String(company._id)) {
      throw new Error(`The existing ${account.role} demo account is linked to a different company.`);
    }
  }

  await Subscription.updateOne(
    { companyId: company._id },
    { $setOnInsert: { companyId: company._id, plan: 'starter', status: 'active' } },
    { upsert: true },
  );

  return { company, superAdmin, companyAdmin };
}

if (require.main === module) {
  assertDevelopment();
  connectDB()
    .then(seedDemoAdmin)
    .then(({ company, superAdmin, companyAdmin }) => {
      console.log(`Development accounts are ready for ${company.name}: ${superAdmin.email} (super_admin), ${companyAdmin.email} (company_admin), and other configured demo roles.`);
    })
    .catch((error) => {
      console.error('Demo seed failed:', error.message);
      process.exitCode = 1;
    })
    .finally(() => require('mongoose').disconnect());
}

module.exports = { seedDemoAdmin };
